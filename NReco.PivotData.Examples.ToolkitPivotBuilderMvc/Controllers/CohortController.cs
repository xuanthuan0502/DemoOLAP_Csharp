/*
 *  Copyright 2017 Vitaliy Fedorchenko (nrecosite.com)
 *
 *  Licensed under PivotData Source Code Licence (see LICENSE file).
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS 
 *  OF ANY KIND, either express or implied.
 */

using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Web;
using System.Web.Mvc;
using System.Xml;
using System.IO;
using System.Net;
using System.Threading;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.UI;
using System.Data;
using System.Web.Script.Serialization;
using System.Web.Caching;
using System.Web.Security;

using NReco.PivotData;
using NReco.PivotData.Input;
using NReco.PivotData.Input.Value;
using NReco.PivotData.Output;

using Models;

namespace Controllers {
	
	public class CohortController : Controller {

		public ActionResult UserRetention() {

			var eventsCube = LoadUserEventsCube();

			// in "eventsCube" we have information about:
			// - user registration (year, month)
			// - number of actions in period (year, month)

			var cohortData = new PivotData(
					new[] { "Reg Year", "Reg Month", "Active Year", "Active Month" },
					new CountUniqueAggregatorFactory("ID"));
			cohortData.ProcessData(eventsCube, "actions_count");

			// lets transform (Active Year, Active Month) to difference from Reg Date
			// and get columns 0, 1, 2 ...
			cohortData = new SliceQuery(cohortData).Dimension("Reg Year").Dimension("Reg Month")
				.Dimension("Month", (dimKeys) => {
					// "Reg Year"*12+"Reg Month"
					var regMonthTotal = Convert.ToInt32(dimKeys[0]) * 12 + Convert.ToInt32(dimKeys[1]);
					// "Active Year"*12+"Active Month"
					var activeMonthTotal = Convert.ToInt32(dimKeys[2]) * 12 + Convert.ToInt32(dimKeys[3]);
					return (activeMonthTotal - regMonthTotal);
				}).Execute();


			var cohortTbl = new PivotTable(
					new[] { "Reg Year", "Reg Month" }, new[] { "Month" }, cohortData,
					// order rows and columns desc
					new NaturalSortKeyComparer(false), new NaturalSortKeyComparer(false)
				);

			// calculate as percentage
			var percentCohortTbl = new PercentagePivotTable(cohortTbl, PercentagePivotTable.PercentageMode.RowTotal);
			var heatmapPvtTbl = new HeatmapPivotTable(percentCohortTbl, HeatmapPivotTable.HeatmapMode.Row);

			var m = new CohortReport() {
				PivotTableJson = GetCohortPivotTableJson(percentCohortTbl),
				PivotTableHtml = GetCohortPivotTableHtml(heatmapPvtTbl),
			};
			return View(m);
		}

		string GetCohortPivotTableJson(IPivotTable pvtTbl) {
			var strWr = new StringWriter();
			new PivotTableJsonWriter(strWr).Write(pvtTbl);
			return strWr.ToString();
		}

		string GetCohortPivotTableHtml(IPivotTable pvtTbl) {
			var strWr = new StringWriter();
			var pvtTblWr = new PivotTableHtmlWriter(strWr);
			pvtTblWr.TotalsColumn = false;
			pvtTblWr.TotalsRow = false;
			pvtTblWr.GrandTotal = false;
			pvtTblWr.FormatValue = (aggr, idx) => aggr.Count>0 ? String.Format("{0:0.##}%", aggr.Value) : String.Empty;
			pvtTblWr.Write(pvtTbl);
			return strWr.ToString();
		}

		IPivotData LoadUserEventsCube() {
			using (var csvFileRdr = new StreamReader(HttpContext.Server.MapPath("~/App_Data/user_events.csv")) ) {
				var csvConfig = new CsvConfiguration() {
					Delimiter = ","
				};
				var csvSource = new CsvSource(csvFileRdr, csvConfig);

				// parse dates (as they come from CSV as strings)
				var invariantCulture = System.Globalization.CultureInfo.InvariantCulture;
				var parseDateValSource = new DerivedValueSource(csvSource);
				parseDateValSource.Register("Reg Date", 
					new ParseValue("Reg Date") { FormatProvider = invariantCulture }.ParseDateTimeHandler);
				parseDateValSource.Register("Event Date", 
					new ParseValue("Event Date") { FormatProvider = invariantCulture }.ParseDateTimeHandler);

				// calculate by date period (month in this example)
				var derivedValSource = new DerivedValueSource(parseDateValSource);
				derivedValSource.Register("Reg Year", new DatePartValue("Reg Date").YearHandler);
				derivedValSource.Register("Reg Month", new DatePartValue("Reg Date").MonthNumberHandler);
				derivedValSource.Register("Active Year", new DatePartValue("Event Date").YearHandler);
				derivedValSource.Register("Active Month", new DatePartValue("Event Date").MonthNumberHandler);

				var pvtData = new PivotData(new[] { "Reg Year", "Reg Month", "Active Year", "Active Month", "ID" },
						new CountAggregatorFactory());
				pvtData.ProcessData(derivedValSource);
				return pvtData;
			}
		}


	}
}
