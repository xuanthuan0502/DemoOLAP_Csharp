using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Web;
using Elasticsearch.Net;
using Newtonsoft.Json.Linq;

using NReco.PivotData;
using NReco.PivotData.Input;

namespace Services {

	public class ElasticSearchCube : ICube {

		public string Id { get; }
		public string Name { get; set; }

		string ElasticIndex;
		string ElasticDocType;

		PivotDataConfiguration CubeCfg;
		ElasticLowLevelClient ElasticClient;

		public ElasticSearchCube(string id, PivotDataConfiguration pvtCfg, ElasticLowLevelClient elasticClient, string index, string docType) {
			Id = id;
			Name = id;
			CubeCfg = pvtCfg;
			ElasticClient = elasticClient;
			ElasticIndex = index;
			ElasticDocType = docType;
		}

		public PivotDataConfiguration GetConfiguration() {
			return CubeCfg;
		}

		PivotDataConfiguration ComposePivotDataCfg(string[] dims, int[] aggrs) {
			var pvtDataCfg = new PivotDataConfiguration() {
				Dimensions = dims,
				Aggregators = new AggregatorFactoryConfiguration[aggrs.Length]
			};
			for (int i=0; i<aggrs.Length; i++) {
				pvtDataCfg.Aggregators[i] = CubeCfg.Aggregators[aggrs[i]];
			}
			return pvtDataCfg;
		}

		public IPivotData LoadPivotData(string[] dims, int[] aggrs) {
			var pvtDataCfg = ComposePivotDataCfg(dims, aggrs);

			var elasticQuery = new ElasticSearchQuery(pvtDataCfg);
			var q = elasticQuery.Compose();

			var resp = ElasticClient.Search<StringResponse>(ElasticIndex, ElasticDocType, PostData.String(q));
			var elasticSearchSrc = new ElasticSearchAggregateResults(pvtDataCfg, resp.Body);

			var pvtReader = new GroupedSourceReader(elasticSearchSrc, "Count");
			return pvtReader.Read(pvtDataCfg, new PivotDataFactory());
		}

		#region ElasticSearch query composer and results processor from ToolkitElasticSearchSource example

		public class ElasticSearchQuery {

			PivotDataConfiguration PvtDataCfg;

			Dictionary<string, string> aggrNameToFuncName = new Dictionary<string, string>() {
				{"Sum", "sum"},
				{"Average", "avg"},
				{"Min", "min"},
				{"Max", "max"}
			};

			public ElasticSearchQuery(PivotDataConfiguration pvtDataCfg) {
				PvtDataCfg = pvtDataCfg;
			}

			public string Compose() {
				// here you can add any additional query options (say, filters)

				var topObj = new JObject();
				topObj.Add("size", new JValue(0));
				var currObj = topObj;
				for (int i = (PvtDataCfg.Dimensions.Length - 1); i >= 0; i--) {
					var dimName = PvtDataCfg.Dimensions[i];
					var aggsObj = new JObject();
					currObj.Add("aggs", aggsObj);

					var byObj = new JObject();
					aggsObj.Add("by_" + dimName, byObj);

					var termsObj = new JObject();
					byObj.Add("terms", termsObj);
					termsObj.Add("field", new JValue(dimName));
					termsObj.Add("size", new JValue(100000));   // some reasonable number of keys to return

					if (i == 0) {
						var finalAggsObj = new JObject();
						int propsCnt = 0;
						for (int j = 0; j < PvtDataCfg.Aggregators.Length; j++) {
							var aggr = PvtDataCfg.Aggregators[j];
							if (aggr.Name == "Count" || aggr.Params == null || aggr.Params.Length < 1)
								continue; // ignore: elasic always returns counts

							var aggrFuncNameObj = new JObject();
							string aggrFuncName;
							if (!aggrNameToFuncName.TryGetValue(aggr.Name, out aggrFuncName))
								throw new Exception("Unsupported aggregator: " + aggr.Name);

							var aggrFldObj = new JObject();
							aggrFldObj.Add("field", Convert.ToString(aggr.Params[0]));
							aggrFuncNameObj.Add(aggrFuncName, aggrFldObj);

							finalAggsObj.Add($"{aggr.Name}_{aggr.Params[0]}", aggrFuncNameObj);
							propsCnt++;

						}
						if (propsCnt > 0)
							byObj.Add("aggs", finalAggsObj);
					}

					currObj = byObj;
				}
				return topObj.ToString();
			}

		}

		public class ElasticSearchAggregateResults : IPivotDataSource {

			PivotDataConfiguration PvtDataCfg;
			string ResultJson;

			Dictionary<string, int> DimNameToIdx;
			Dictionary<string, int> AggrFldToIdx;

			public ElasticSearchAggregateResults(PivotDataConfiguration pvtDataCfg, string resJson) {
				PvtDataCfg = pvtDataCfg;
				ResultJson = resJson;

				DimNameToIdx = new Dictionary<string, int>();
				for (int i = 0; i < PvtDataCfg.Dimensions.Length; i++) {
					DimNameToIdx[PvtDataCfg.Dimensions[i]] = i;
				}

				AggrFldToIdx = new Dictionary<string, int>();
				for (int i = 0; i < PvtDataCfg.Aggregators.Length; i++) {
					var aggr = PvtDataCfg.Aggregators[i];

					// compose field names used by GroupedSourceReader to load aggregators values
					// see https://www.nrecosite.com/pivotdata/load-pre-aggregated-data.aspx

					var fldName = aggr.Name;
					if (aggr.Name != "Count" && aggr.Params != null && aggr.Params.Length > 0)
						fldName = Convert.ToString(aggr.Params[0]) + "_" + fldName;
					AggrFldToIdx[fldName] = i;
				}
			}

			public void ReadData(Action<IEnumerable, Func<object, string, object>> handler) {
				handler(GetResults(ResultJson), GetResultEntryValue);
			}

			IEnumerable<ResultEntry> GetResults(string resJson) {
				var topObj = JObject.Parse(resJson);
				var resEntry = new ResultEntry() {
					DimKeys = new object[PvtDataCfg.Dimensions.Length],
					Metrics = new object[PvtDataCfg.Aggregators.Length]
				};
				var aggregations = topObj["aggregations"] as JObject;
				foreach (var entry in ProcessBuckets(aggregations, PvtDataCfg.Dimensions.Length - 1, resEntry))
					yield return entry;
			}

			IEnumerable<ResultEntry> ProcessBuckets(JObject obj, int dimIdx, ResultEntry resEntry) {
				var propName = "by_" + PvtDataCfg.Dimensions[dimIdx];
				var byObj = obj[propName] as JObject;
				var buckets = byObj["buckets"] as JArray;
				for (int i = 0; i < buckets.Count; i++) {
					var bucketObj = buckets[i] as JObject;
					var key = (bucketObj["key"] as JValue).Value;
					resEntry.DimKeys[dimIdx] = key;
					if (dimIdx > 0) {
						foreach (var entry in ProcessBuckets(bucketObj, dimIdx - 1, resEntry))
							yield return entry;
					} else {
						resEntry.Count = ((JValue)bucketObj["doc_count"]).Value<int>();
						for (int j = 0; j < PvtDataCfg.Aggregators.Length; j++) {
							var aggrCfg = PvtDataCfg.Aggregators[j];
							if (aggrCfg.Name == "Count") {
								resEntry.Metrics[j] = resEntry.Count;
							} else if (aggrCfg.Params != null && aggrCfg.Params.Length > 0) {
								var metricObj = (JObject)bucketObj[aggrCfg.Name + "_" + Convert.ToString(aggrCfg.Params[0])];
								var metricVal = ((JValue)metricObj.GetValue("value")).Value;
								resEntry.Metrics[j] = metricVal;
							} else {
								throw new NotSupportedException("Cannot read values for aggregator " + aggrCfg.Name);
							}
						}
						yield return resEntry;
					}
				}
			}

			public class ResultEntry {
				public object[] DimKeys;

				public int Count;
				public object[] Metrics;
			}

			// handler for GroupedSourceReader
			object GetResultEntryValue(object row, string field) {
				var resEntry = (ResultEntry)row;
				if (field == "Count")
					return resEntry.Count;
				if (DimNameToIdx.TryGetValue(field, out var dimIdx))
					return resEntry.DimKeys[dimIdx];
				if (AggrFldToIdx.TryGetValue(field, out var metricIdx))
					return resEntry.Metrics[metricIdx];
				throw new ArgumentException("Unknown field: " + field);
			}

		}

		#endregion

	}

}