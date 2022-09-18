/*
 *  Copyright 2015-2017 Vitaliy Fedorchenko (nrecosite.com)
 *
 *  Licensed under PivotData Source Code Licence (see LICENSE file).
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS 
 *  OF ANY KIND, either express or implied.
 */

using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;
using System.IO;

using Models;
using NReco.PivotData;
using NReco.PivotData.Input;

namespace Services {

	public class PivotRepository {

		Dictionary<string,ICube> Cubes;

		public PivotRepository(IEnumerable<ICube> cubes) {
			Cubes = new Dictionary<string,ICube>();
			foreach (var c in cubes)
				Cubes[c.Id] = c;
		}

		public IEnumerable<ICube> GetCubes() {
			return Cubes.Values.ToArray();
		}

		public ICube GetCube(string cubeName) {
			ICube cube = null;
			if (!Cubes.TryGetValue(cubeName, out cube))
				throw new Exception("Unknown cube: "+cubeName);
			// lets wrap ICube implementation with cache wrapper
			// it is especially useful for cases when pivot table data calculation takes
			// significant amount of time
			return new CacheCubeWrapper( cube );
		}


		string[] GetPivotTableDims(PivotTableConfiguration config) {
			var allDims = new HashSet<string>();
			if (config.Rows != null)
				foreach (var rowDim in config.Rows)
					allDims.Add(rowDim);
			if (config.Columns != null)
				foreach (var colDim in config.Columns)
					allDims.Add(colDim);
			return allDims.ToArray();
		}

		public IPivotTable CreatePivotTable(PivotTableReportConfig pvtReportCfg, bool forUi) {
			var cube = GetCube(pvtReportCfg.CubeName);

			var pvtTblCfg = pvtReportCfg.GetPivotTableConfig(cube.GetConfiguration());
			var pvtData = cube.LoadPivotData(GetPivotTableDims(pvtTblCfg), pvtTblCfg.Measures);

			// apply keyword filter
			if (!String.IsNullOrWhiteSpace(pvtReportCfg.Filter)) {
				var cubeFilter = new CubeKeywordFilter(pvtReportCfg.Filter);
				pvtData = cubeFilter.Filter(pvtData);
			}

			var pvtTblFactory = new PivotTableFactory();
			// report measures are selected by ICube.LoadPivotData
			// we provide specially prepared IPivotData instance to PivotTableFactory and no need to slice it additionally
			pvtTblCfg.Measures = null;
			IPivotTable pvtTbl = pvtTblFactory.Create(pvtData, pvtTblCfg);

			var expandCollapseEnabled = pvtReportCfg.ExpandCollapse != null && pvtReportCfg.ExpandCollapse.Enabled;

			// top N limits are not compatible with expand/collapse
			if (!expandCollapseEnabled) {
				// apply TopPivotTable wrapper if limits are specified
				if (pvtReportCfg.LimitColumns.HasValue || pvtReportCfg.LimitRows.HasValue) {
					pvtTbl = new TopPivotTable(pvtTbl,
						pvtReportCfg.LimitRows.HasValue ? pvtReportCfg.LimitRows.Value : Int32.MaxValue,
						pvtReportCfg.LimitColumns.HasValue ? pvtReportCfg.LimitColumns.Value : Int32.MaxValue);
				}
			}

			for (int i = 0; i < pvtReportCfg.Measures.Length; i++) {
				var m = pvtReportCfg.Measures[i];
				if (m.Difference.HasValue)
					pvtTbl = new DifferencePivotTable(pvtTbl, m.Difference.Value, i) {
						Percentage = m.DifferenceAsPercentage
					};
				if (m.Percentage.HasValue)
					pvtTbl = new PercentagePivotTable(pvtTbl, m.Percentage.Value, i);
				if (m.RunningTotal.HasValue)
					pvtTbl = new RunningValuePivotTable(pvtTbl, m.RunningTotal.Value, i);
				if (m.Heatmap.HasValue)
					pvtTbl = new HeatmapPivotTable(pvtTbl, m.Heatmap.Value, i);
			}

			// pagination is not compatible with expand/collapse mode
			if (!expandCollapseEnabled) {  
				var pagePvtTbl = new PaginatePivotTable(pvtTbl,
						pvtReportCfg.RowPage != null && !pvtReportCfg.LimitRows.HasValue ?
							pvtReportCfg.RowPage : new PaginatePivotTable.Page(0, Int32.MaxValue),
						pvtReportCfg.ColumnPage != null && !pvtReportCfg.LimitColumns.HasValue ?
							pvtReportCfg.ColumnPage : new PaginatePivotTable.Page(0, Int32.MaxValue)
					);
				if (!forUi)
					pagePvtTbl.IncludePrevNextGroups = false;

				pvtTbl = pagePvtTbl;
			} else {
				// for exports, apply pivot table wrapper that collapses groups on data model level
				if (!forUi)
					pvtTbl = new CollapsePivotTable(pvtTbl, pvtReportCfg.ExpandCollapse);
			}

			return pvtTbl;
		}

	}
}