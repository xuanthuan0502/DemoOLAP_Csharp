/*
 *  Copyright 2015-2016 Vitaliy Fedorchenko (nrecosite.com)
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

using OfficeOpenXml;
using OfficeOpenXml.Style;

using NReco.PivotData;
using NReco.PivotData.Input;
using NReco.PivotData.Output;

using Models;

namespace Controllers {
	
	// generates customized report (percentages, formatting, header/footer) exportable to PDF/Excel
	public class DashboardController : Controller {

		public ActionResult Projects() {

			var tasksCube = LoadTaskDataCube();

			var m = new ProjectsDashboard() {
				CompletionPivotTableJson = GetPivotTableJson( GetCompletionPivotTable(tasksCube)),
				CompletionPivotTableHtml = GetCompletionPivotTableHtml(tasksCube),

				ActiveTasksByTypePvtTblJson = GetPivotTableJson( GetTasksByTypePivotTable(tasksCube, "In progress")),
				ClosedTasksByTypePvtTblJson = GetPivotTableJson( GetTasksByTypePivotTable(tasksCube, "Completed", "Accepted", "Declined")),
				TasksByTypePivotTableHtml = GetTasksByTypePivotTableHtml(tasksCube)
			};
			return View(m);
		}

		PivotTable GetTasksByTypePivotTable(IPivotData tasksCube, params string[] statuses) {
			var taskByTypeCube = new SliceQuery(tasksCube)
				.Dimension("type").Measure(2).Where("status", statuses).Execute();
			return  new PivotTableFactory().Create(taskByTypeCube, new PivotTableConfiguration() {
				Rows = new[] { "type" }
			} );
		}

		string GetCompletionPivotTableHtml(IPivotData tasksCube) {
			// slice by "project"
			var completionCube = new SliceQuery(tasksCube).Dimension("project").Execute();
			var strWr = new StringWriter();
			var pvtTblWr = new PivotTableHtmlWriter(strWr);
			pvtTblWr.TableClass = "table table-condensed table-bordered pvtTable";
			
			var measureHeaders = new string[] { "Estimated Hours", "Completed Hours", "Tasks Count" };
			pvtTblWr.FormatMeasureHeader = (aggrFactory, aggrIdx) => {
				return measureHeaders[aggrIdx];
			};
			pvtTblWr.TotalsColumn = true;
			pvtTblWr.TotalsRow = false;
			pvtTblWr.GrandTotal = false;
			pvtTblWr.Write( new PivotTableFactory().Create(completionCube, new PivotTableConfiguration() {
				Rows = new[] { "project" }
			} ) );
			return strWr.ToString();
		}

		string GetTasksByTypePivotTableHtml(IPivotData tasksCube) {
			// slice by "type", calculate "major_state" dimension
			var statusDimIdx = Array.IndexOf( tasksCube.Dimensions, "status" );
			var completionCube = new SliceQuery(tasksCube)
					.Dimension("type")
					.Dimension("major_status", (dimKey) => {
						return dimKey[statusDimIdx].ToString()=="In progress" ? "Active" : "Closed";
					})
					.Measure(2)  // tasks count
					.Where("status", "In progress", "Completed", "Accepted", "Declined")
					.Execute();
			var strWr = new StringWriter();
			var pvtTblWr = new PivotTableHtmlWriter(strWr);
			pvtTblWr.TableClass = "table table-condensed table-bordered pvtTable";
			
			pvtTblWr.TotalsColumn = false;
			pvtTblWr.TotalsRow = true;
			pvtTblWr.GrandTotal = false;
			pvtTblWr.Write( new PivotTableFactory().Create(completionCube, new PivotTableConfiguration() {
				Rows = new[] { "type" },
				Columns = new[] { "major_status"}
			} ) );
			return strWr.ToString();
		}
		

		PivotTable GetCompletionPivotTable(IPivotData tasksCube) {
			// slice by "project"
			var completionCube = new SliceQuery(tasksCube).Dimension("project").Execute();
			// calculate % completed vs % remaining
			completionCube = new SliceQuery(completionCube)
					// calculate "completed" % for stacked bar chart
					.Measure(new SumAggregatorFactory("completed"), (aggr) => {
						var compositeAggr = aggr.AsComposite();
						var estimated = Convert.ToDecimal(compositeAggr.Aggregators[0].Value);
						var completed = Convert.ToDecimal(compositeAggr.Aggregators[1].Value);
						return new SumAggregator("completed", 
							new object[] { 
								aggr.Count,
   								Math.Round( completed*100 / estimated )
							});
					})
					// calculate "remaining" % for stacked bar chart
					.Measure(new SumAggregatorFactory("remaining"), (aggr) => {
						var compositeAggr = aggr.AsComposite();
						var estimated = Convert.ToDecimal(compositeAggr.Aggregators[0].Value);
						var completed = Convert.ToDecimal(compositeAggr.Aggregators[1].Value);
						return new SumAggregator("remaining", 
							new object[] { 
								aggr.Count,
   								Math.Round( (estimated - completed )*100 / (estimated)  )
							});
					}) 
					.Execute();
			var completionPvtTbl = new PivotTableFactory().Create(completionCube, new PivotTableConfiguration() {
				Rows = new[] { "project" }
			} );
			return completionPvtTbl;
		}

		string GetPivotTableJson(IPivotTable pvtTbl) {
			var strWr = new StringWriter();
			new PivotTableJsonWriter(strWr).Write(pvtTbl);
			return strWr.ToString();
		}

		IPivotData LoadTaskDataCube() {
			// in this example data cube is loaded from files for the sake of simplicity
			// replace it with code snippet from ToolkitDbSource to load data from DB
			// replace it with code snippet from ToolkitInputOutput to load data from CSV/TSV file

			var tasksTbl = GetTasks();
			var pvtData = new PivotData(new [] { 
					"project", "type", "user", "status"
				}, new CompositeAggregatorFactory(
					new SumAggregatorFactory("estimated"),
					new SumAggregatorFactory("completed"),
					new CountAggregatorFactory()	
				) );
			pvtData.ProcessData( new DataTableReader(tasksTbl) );

			return pvtData;
		}

		// this is 'fake' project tasks dataset used in this example
		// NOTE: you don't need to load ALL data into memory in the real-life applications!
		DataTable GetTasks() {
			// sample "orders" table that contains 1,000 rows
			var t = new DataTable("tasks");
			t.Columns.Add("project", typeof(string));
			t.Columns.Add("type", typeof(string));
			t.Columns.Add("user", typeof(string));
			t.Columns.Add("status", typeof(string));

			t.Columns.Add("estimated", typeof(decimal));
			t.Columns.Add("completed", typeof(decimal));
			
			t.Columns.Add("closed_year", typeof(int));
			t.Columns.Add("closed_month", typeof(int));
			t.Columns.Add("closed_day", typeof(int));

			var taskTypes = new[] { "new feature", "new feature", "bugfix", "bugfix", "enhancement", "deployment", "support" }; 
			var projects = new [] { "Project #1",  "Project #2", "Project #3"};
			var taskStatuses = new [] { 
					"Proposed", 
					"In progress", "In progress", 
					"Completed", "Completed",
					"Accepted", "Accepted", "Accepted",
					"Declined" };

			var users = new [] { "John", "Michael", "Alex", "Jessica", "Amanda", "Rebecca", "Eric" };


			for (int i = 1; i <= 1000; i++) {
				var q = 1+(i%6);
				var projIdx = (i+i%10)%projects.Length;
				var typeIdx = (i+i/100)%taskTypes.Length;
				var taskType = taskTypes[typeIdx];
				var estimated = 10+ i%10 * 10;
				var taskStatus = taskStatuses[i%taskStatuses.Length];
				if (projIdx==2 && taskStatus=="Completed") taskStatus = "In progress";

				var completed = estimated;
				switch (taskStatus) {
					case "Proposed": completed = 0; break;
					case "In progress": 
						completed = (i%21)* estimated / 100 * (projIdx+1); 
						if (i%2==0 && taskType!="new feature")
							taskType = "new feature";
						break;
				}

				t.Rows.Add(new object[] {
					projects[projIdx],
					taskType,
					users[i%users.Length],
					taskStatus,
 					estimated,
					completed,
					2013 + (i%2),
					1+(i%12),
					i%29
				});
			}
			t.AcceptChanges();
			return t;
		}

	}
}
