using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Web;
using System.IO;
using System.Data;
using System.Data.Common;

using NReco.PivotData;
using NReco.PivotData.Input;

using Microsoft.AnalysisServices.AdomdClient;

namespace Services {
	
	/// <summary>
	/// Implements data cube for SSAS OLAP server data source through Adomd.NET library.
	/// </summary>
	public class MdxAdomdCube : ICube {

		public string Id { get; private set; }

		public string Name { get; set; }

		IDbConnection Connection;

		string MdxTemplate;
		string CountMeasure;  // specify count measure if you want to load IAggregator.Count property

		PivotDataConfiguration PvtCfg;

		public PivotDataFactory PvtDataFactory { get; set; }

		/// <summary>
		/// Initializes <see cref="MdxAdomdCube"/> instance.
		/// </summary>
		/// <param name="id">cube name (unique identifier)</param>
		/// <param name="pvtCfg">cube configuration: available dimensions and measures. Use ONLY 'FirstAggregator' measures.</param>
		/// <param name="connection">Adomd.net connection instance</param>
		/// <param name="mdx">MDX query template like "SELECT {0} FROM [MyCube]"</param>
		public MdxAdomdCube(string id, PivotDataConfiguration pvtCfg, IDbConnection connection, string mdxTemplate, string countMeasure = null) {
			Id = id;
			Name = id;
			PvtCfg = pvtCfg;
			Connection = connection;
			MdxTemplate = mdxTemplate;
			CountMeasure = countMeasure;

			PvtDataFactory = new PivotDataFactory();
		}

		public PivotDataConfiguration GetConfiguration() {
			return PvtCfg;
		}

		/// <summary>
		/// This method composes MDX only for specified dimensions/aggregators
		/// </summary>
		string GetMdx(string[] dims, int[] aggrs) {
			var onAxisList = new List<string>();
			var measuresList = new List<string>();

			onAxisList.Add(String.Format("NON EMPTY {{ {0} }} ON 1", 
				String.Join(" * ", dims.Select(d => d+".ALLMEMBERS")))
			);

			/*foreach (var dim in dims) {
				onAxisList.Add(String.Format("{{ {0}.ALLMEMBERS }} ON {1}", dim, onAxisList.Count+1));
			}*/
			if (CountMeasure!=null)
				measuresList.Add(CountMeasure);

			foreach (var aggrIdx in aggrs) {
				var aggrCfg = PvtCfg.Aggregators[aggrIdx];

				// THIS implementation uses only special 'First' aggregator
				// if you want to use standard implementations like "Count", "Sum" etc, see comment below in'LoadPivotData'
				if (aggrCfg.Name != "First")
					throw new NotSupportedException("MdxAdomdCube supports only FirstAggregator");

				if (aggrCfg.Params == null || aggrCfg.Params.Length == 0)
					throw new InvalidOperationException("Incorrect aggregator configuration: parameter (MDX measure identifier) is missed");

				if (Convert.ToString(aggrCfg.Params[0])==CountMeasure ) // count is already present
					continue;
				measuresList.Add(Convert.ToString(aggrCfg.Params[0]));
			}
			onAxisList.Add(String.Format("NON EMPTY {{ {0} }} ON 0", String.Join(",", measuresList.ToArray())));

			var mdx = String.Format(MdxTemplate, String.Join(",", onAxisList.ToArray()));
			return mdx;
		}

		public IPivotData LoadPivotData(string[] dims, int[] aggrs) {

			// construct config exactly for this report
			var pvtDataCfg = new PivotDataConfiguration() {
				Dimensions = dims,
				Aggregators = aggrs.Select(aggrIdx => PvtCfg.Aggregators[aggrIdx]).ToArray()
			};

			var dbCmd = Connection.CreateCommand();
			dbCmd.CommandText = GetMdx(dims, aggrs);

			var dbCmdSource = new DbCommandSource(dbCmd);
			var adomdSource = new ResolveAdomdSource(dbCmdSource, 
					CountMeasure!=null ? new[] { CountMeasure } 
						: pvtDataCfg.Aggregators.Select(a=>Convert.ToString(a.Params[0])).ToArray() );
			var nullAsKeyEmptySource = new NullAsKeyEmptySource(adomdSource, 
					pvtDataCfg.Aggregators.Select(a=> Convert.ToString(a.Params[0])).ToArray());

			var groupedPvtDataReader = new GroupedSourceReader(
					nullAsKeyEmptySource,
					CountMeasure ?? "__COUNT_STUB_VALUE"  // column name with rows count for each entry
				);
			// register state composer for custom "FirstAggregator" that holds only first value in recordset
			// this is ok for OLAP server as it returns all totals/sub-totals (no need to calculate them by PivotData)

			// however, you can use standard "Count", "Sum", "Average" etc instead if you want: 
			// in this case you need to re-configure default setup of GroupedSourceReader aggregator composers (see https://www.nrecosite.com/pivotdata/load-pre-aggregated-data.aspx)
			// OR re-map names of the measure field in 'ResolveAdomdSource'.

			groupedPvtDataReader.AggregatorStateComposers.Add(
				new GroupedSourceReader.ArrayAggregatorStateComposer("First",
					// FirstAggregator state is an array of 2 elements:
					// [0] = count: take from field specified in "CountMeasure"
					// [1] = value (any type): take from FirstAggregatorFactory field
					new[] { CountMeasure ?? "__COUNT_STUB_VALUE", "{0}" },    // state values field name templates
					new[] { typeof(uint), typeof(object) })   // types of state values
			);

			var pvtDataState = groupedPvtDataReader.ReadState(pvtDataCfg);
			var aggrFactories = aggrs.Select( 
					aggrIdx => new FirstAggregatorFactory((string)PvtCfg.Aggregators[aggrIdx].Params[0], (string)PvtCfg.Aggregators[aggrIdx].Params[0])
				).ToArray();
			var pvtData = new FixedPivotData(
					dims, 
					aggrFactories.Length>1 ? (IAggregatorFactory)new CompositeAggregatorFactory(aggrFactories) : aggrFactories[0],
					pvtDataState);
			return pvtData;
		}

		#region Adomd-specific data source and aggregator

		// Classes come from ToolkitAdomdSource example:
		// - NullAsKeyEmptySource (correct handling of rows with sub-totals)
		// - ResolveAdomdSource (correct handling of result of AdomdDataReader)
		// - FirstAggregator (keeps OLAP server measure values as is)

		/// <summary>
		/// <see cref="IPivotDataSource"/> wrapper that converts all null or DBNull.Value to Key.Empty
		/// </summary>
		/// <remarks>Used for loading totals and sub-totals from sources like SSAS.</remarks>
		public class NullAsKeyEmptySource : IPivotDataSource {

			IPivotDataSource BaseSource;
			private HashSet<string> Measures;

			public NullAsKeyEmptySource(IPivotDataSource baseSource, string[] measures) {
				BaseSource = baseSource;
				Measures = new HashSet<string>(measures);
			}

			public void ReadData(Action<IEnumerable, Func<object, string, object>> readData) {
				BaseSource.ReadData((data, getValue) => {
					readData(data, (row, field) => {
						var val = getValue(row, field);
						if (val == null || DBNull.Value.Equals(val)) {
							//return Key.Empty only for dimensions not measures
							val = Measures.Contains(field) ? null : Key.Empty;
						}
						return val;
					});
				});
			}
		}

		/// <summary>
		/// <see cref="IPivotDataSource"/> wrapper that resolved AdomdDataReader field by prefix and skips 'empty' rows.
		/// </summary>
		public class ResolveAdomdSource : IPivotDataSource {

			IPivotDataSource BaseSource;
			string[] TestNotNullFieldNames;

			public ResolveAdomdSource(IPivotDataSource baseSource, string[] testNotNullFieldNames) {
				BaseSource = baseSource;
				TestNotNullFieldNames = testNotNullFieldNames;
			}

			IEnumerable filterRowsWithNull(IEnumerable data) {
				// if NON EMPTY is not specified AdomdDataReader can return rows with NULL in measures
				// lets just skip them
				foreach (var r in data) {
					var rdr = (IDataReader)r;
					if (TestNotNullFieldNames != null) {
						for (int i = 0; i < TestNotNullFieldNames.Length; i++)
							if (rdr[TestNotNullFieldNames[i]] != null) {
								yield return r;
								break;
							}
						continue;
					}
					yield return r;
				}
			}

			public void ReadData(Action<IEnumerable, Func<object, string, object>> readData) {
				BaseSource.ReadData((data, getValue) => {
					var resolvedFields = new Dictionary<string, string>();
					var knownFields = new HashSet<string>();

					string resolveFieldName(IDataReader rdr, string f) {
						if (resolvedFields.TryGetValue(f, out var resolvedFld))
							return resolvedFld;

						if (knownFields.Count < rdr.FieldCount)
							for (int i = 0; i < rdr.FieldCount; i++)
								knownFields.Add(rdr.GetName(i));

						if (knownFields.Contains(f)) {
							// field exists
							resolvedFields[f] = f;
							return f;
						}
						// try to find field by prefix
						foreach (var fName in knownFields) {
							if (fName.StartsWith(f)) {
								resolvedFields[f] = fName;
								return fName;
							}
						}
						// no matches by prefix
						// return field name as is, it will cause 'invalid field name' error
						return f;
					}

					readData(filterRowsWithNull(data), (row, field) => {
						var rdr = (IDataReader)row;
						if (field == "__COUNT_STUB_VALUE") return 1;
						return getValue(row, resolveFieldName(rdr, field));
					});
				});
			}
		}

		/// <summary>
		/// Implements special aggregator that always holds only first value.
		/// </summary>	 
		public class FirstAggregator : IAggregator {

			object value = null;
			uint count = 0;
			string field;

			public FirstAggregator(string f) {
				field = f;
			}

			public FirstAggregator(string f, object state) : this(f) {
				var stateArr = state as object[];
				if (stateArr == null || stateArr.Length != 2)
					throw new InvalidOperationException("invalid state");
				count = Convert.ToUInt32(stateArr[0]);
				value = stateArr[1];
			}

			public void Push(object r, Func<object, string, object> getValue) {
				var v = getValue(r, field);
				if (v != null && !DBNull.Value.Equals(v)) {
					if (count == 0) {
						value = v;
					}
					count++;
				}
			}

			public object Value {
				get { return value; }
			}

			public uint Count {
				get { return count; }
			}

			public void Merge(IAggregator aggr) {
				if (count == 0) {
					value = aggr.Value;
					count = aggr.Count;
				}
			}

			public object GetState() {
				return new object[] { count, value };
			}
		}

		public class FirstAggregatorFactory : IAggregatorFactory {

			public string Field { get; private set; }

			public string Caption { get; private set; }

			public FirstAggregatorFactory(string field, string caption) {
				Field = field;
				Caption = caption;
			}

			public IAggregator Create() {
				return new FirstAggregator(Field);
			}

			public IAggregator Create(object state) {
				return new FirstAggregator(Field, state);
			}

			public override bool Equals(object obj) {
				var factory = obj as FirstAggregatorFactory;
				if (factory == null)
					return false;
				return factory.Field == Field;
			}

			public override string ToString() {
				return Caption ?? Field;
			}
		}


		#endregion

	}

}