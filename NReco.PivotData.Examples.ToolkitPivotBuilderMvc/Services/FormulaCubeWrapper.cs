using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;
using NReco.PivotData;

namespace Services {

	/// <summary>
	/// Use this wrapper to add calculated members to the cube.
	/// </summary>
	/// <remarks>
	/// How to use: in PivotController.cs wrap 
	/// <code>
	/// new FormulaCubeWrapper(
	///   new SqlGroupByCube("northwind",  ....  )
	/// ) {
	/// 	FormulaMeasures = new[] {
	/// 		new FormulaDefinition() {
	///				Name = "Avg Total",
	///				ArgumentMeasureIndexes = new [] { 0, 1 },
	///				GetValue = (aggrs) => {
	///					var cnt = Convert.ToDecimal( aggrs[0].Value );
	///					var sum = Convert.ToDecimal( aggrs[1].Value );
	///					return cnt>0 ? sum/cnt : 0;
	///				}
	///			}
	///		}
	///	}
	/// </code>
	/// </remarks>
	public class FormulaCubeWrapper : ICube {

		ICube Cube;

		public FormulaDefinition[] FormulaMeasures { get; set; }

		public FormulaCubeWrapper(ICube cube) {
			Cube = cube;
		}

		public string Id => Cube.Id;

		public string Name => Cube.Name;

		public PivotDataConfiguration GetConfiguration() {
			var pvtDataCfg = Cube.GetConfiguration();
			if (FormulaMeasures!=null) {
				var aggrList = new List<AggregatorFactoryConfiguration>(pvtDataCfg.Aggregators);
				foreach (var formulaMsr in FormulaMeasures) {
					aggrList.Add(new AggregatorFactoryConfiguration(formulaMsr.Name, null));
				}
				pvtDataCfg.Aggregators = aggrList.ToArray();
			}
			return pvtDataCfg;
		}

		public IPivotData LoadPivotData(string[] dims, int[] aggrs) {
			var origPvtDataCfg = Cube.GetConfiguration();
			if (aggrs.Any(aggrIdx => aggrIdx >= origPvtDataCfg.Aggregators.Length )) {
				var aggrIdxToLoad = new List<int>();
				var aggrIdxToLoadedIdx = new Dictionary<int, int>();
				foreach (var aggrIdx in aggrs) {
					if (aggrIdx >= origPvtDataCfg.Aggregators.Length) {
						// this is formula aggr
						var formulaMsr = FormulaMeasures[aggrIdx - origPvtDataCfg.Aggregators.Length];
						// lets push indexes of arguments
						if (formulaMsr.ArgumentMeasureIndexes != null)
							foreach (var argAggrIdx in formulaMsr.ArgumentMeasureIndexes) {
								aggrIdxToLoadedIdx[argAggrIdx] = aggrIdxToLoad.Count;
								aggrIdxToLoad.Add(argAggrIdx);
							}
					} else {
						aggrIdxToLoadedIdx[aggrIdx] = aggrIdxToLoad.Count;
						aggrIdxToLoad.Add(aggrIdx);
					}
				}
				var pvtData = Cube.LoadPivotData(dims, aggrIdxToLoad.ToArray());
				// now lets calculate formulas
				var sliceQuery = new SliceQuery(pvtData);
				foreach (var aggrIdx in aggrs) {
					if (aggrIdx >= origPvtDataCfg.Aggregators.Length) {
						// this is formula aggr
						var formulaMsr = FormulaMeasures[aggrIdx - origPvtDataCfg.Aggregators.Length];
						sliceQuery.Measure(formulaMsr.Name, 
							formulaMsr.GetValue, 
							formulaMsr.ArgumentMeasureIndexes.Select(i=>aggrIdxToLoadedIdx[i]).ToArray() );
					} else {
						sliceQuery.Measure(aggrIdxToLoadedIdx[aggrIdx]);
					}
				}
				return sliceQuery.Execute();
			}
			return Cube.LoadPivotData(dims, aggrs);
		}
	}

	public class FormulaDefinition {
		public string Name;
		public Func<IAggregator[], object> GetValue;
		public int[] ArgumentMeasureIndexes;
	}

}