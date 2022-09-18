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

using NReco.PivotData;
using NReco.PivotData.Input;
using NReco.PivotData.Output;

using Models;
using Services;

namespace Controllers {
	
	public class PivotController : Controller {

		PivotRepository pvtRepository;

		public PivotController() {
			// in this example list of cubes is initalizes in the conntroller constructor only for the sake of simplicity
			// in real-world scenario it can be instantiated by IoC-container
			// or constructed by cubes configurations stored in the database

			pvtRepository = new PivotRepository(
				new ICube[] { 

					// serialized cubes saved to files with NReco.PivotData.Output.CubeFileWriter
				/*	new PivotDataFileCube("ChicagoCrimesCube") {
						Name = "Reported incidents of crime (City of Chicago from 2001 to present, ~5,800,000 rows/1.3Gb CSV)"
					},
					new PivotDataFileCube("IPO_transactions_2014_2015") {
						Name = "Financial transactions spending made by the Intellectual Property Office (data.gov.uk)"
					},
					new PivotDataFileCube("TechCrunchCube") {
						Name = "TechCrunch Continental USA (1,460 company funding records reported by TechCrunch)"
					},*/

					// example of cube by SQL data that aggregates data on database level with GROUP BY
					// this approach should be used for large datasets (millions of rows or more)
			/*		new SqlGroupByCube("northwind", 
						new PivotDataConfiguration() {
							// dimensions should correspond to colums returned by SQL query
							Dimensions = new[]{"CategoryName","OrderDate_year","OrderDate_month","ProductName","CompanyName","Country","Region","City"},

							// aggregator arguments also should correspond to columns returned by SQL query
							Aggregators = new[] {
								new AggregatorFactoryConfiguration("Count",null),
								new AggregatorFactoryConfiguration("Sum", new object[] { "LineTotal" }),
								new AggregatorFactoryConfiguration("Average", new object[] { "Quantity" })
							}
						},
						// instead of SQLiteConnection you can use any ADO.NET-compatible provider:
						//   SQL Server: System.Data.SqlClient.SqlConnection
						//   MySql: MySql.Data.MySqlClient.MySqlConnection
						//   PostgreSql: Npgsql.NpgsqlConnection 
						new System.Data.SQLite.SQLiteConnection("Data Source="+ System.Web.HttpContext.Current.Server.MapPath("~/App_Data/northwind.db") ),
						
						@"
							SELECT p.ProductName, c.CategoryName, 
								CAST(strftime('%Y',o.OrderDate) as integer) as OrderDate_year, 
								CAST(strftime('%m', o.OrderDate) as integer) as OrderDate_month, 
								cust.CompanyName, cust.Country, cust.Region, cust.City, od.Quantity,
								CAST( (od.Quantity*od.UnitPrice) as REAL) as LineTotal 
							FROM [Order Details] od 
							LEFT JOIN [Orders] o ON (o.OrderID=od.OrderID) 
							LEFT JOIN [Products] p ON (p.ProductID=od.ProductID) 
							LEFT JOIN [Categories] c ON (c.CategoryID=p.CategoryID) 
							LEFT JOIN [Customers] cust ON (cust.CustomerID=o.CustomerID)
						"
					) {
						Name = "Northwind DB Orders (SQL data source)"
					},*/
					new SqlGroupByCube("kho",
						new PivotDataConfiguration() {
							// dimensions should correspond to colums returned by SQL query
							Dimensions = new[]{"Ma_MatHang", "Ma_CuaHang", "Nam", "Quy", "Thang", "Ngay"},

							// aggregator arguments also should correspond to columns returned by SQL query
							Aggregators = new[] {
								
								new AggregatorFactoryConfiguration("Sum", new object[] { "SoLuong" }),
								new AggregatorFactoryConfiguration("Sum", new object[] { "TongGia" })
							}
						},
					new System.Data.SqlClient.SqlConnection("Data Source=DESKTOP-HVSOVTD;Initial Catalog=khodulieu;"+ "Integrated Security=True" ),
					@"
								SELECT p.Ma_MatHang, s.Ma_CuaHang,
								d.Ngay, d.Thang, d.Quy, d.Nam,	
								od.TongGia,od.SoLuong
								
							FROM [dbo].[Fact_Kho] od 
							LEFT JOIN [dbo].[Dim_CuaHang] s ON s.Ma_CuaHang=od.Ma_CuaHang 
							LEFT JOIN [dbo].[Dim_MatHang] p ON p.Ma_MatHang=od.Ma_MatHang
							LEFT JOIN [dbo].[Dim_ThoiGian] d ON d.Ma_ThoiGian=od.Ma_ThoiGian  
							
						"
					) {
						Name = "Bao cao Kho"
					},
					new SqlGroupByCube("doanhso",
						new PivotDataConfiguration() {
							// dimensions should correspond to colums returned by SQL query
							Dimensions = new[]{"Ma_MatHang", "Ma_CuaHang", "Nam", "Quy", "Thang", "Ngay"},

							// aggregator arguments also should correspond to columns returned by SQL query
							Aggregators = new[] {

								new AggregatorFactoryConfiguration("Sum", new object[] { "TongDoanhThu" }),
								new AggregatorFactoryConfiguration("Sum", new object[] { "SoLuongDat" })
							}
						},
					new System.Data.SqlClient.SqlConnection("Data Source=DESKTOP-HVSOVTD;Initial Catalog=khodulieu;"+ "Integrated Security=True" ),
					@"
								SELECT p.Ma_MatHang, s.Ma_CuaHang,
								d.Ngay, d.Thang, d.Quy, d.Nam,	
								od.TongDoanhThu,od.SoLuongDat
								
							FROM [dbo].[Fact_DoanhSo] od 
							LEFT JOIN [dbo].[Dim_CuaHang] s ON s.Ma_CuaHang=od.Ma_CuaHang 
							LEFT JOIN [dbo].[Dim_MatHang] p ON p.Ma_MatHang=od.Ma_MatHang
							LEFT JOIN [dbo].[Dim_ThoiGian] d ON d.Ma_ThoiGian=od.Ma_ThoiGian  
							
						"
					) {
						Name = "Bao cao DoanhSo"
					},
					// example of cube by SQL data that reads only columns needed for the report
					// aggregation is performed by PivotData.ProcessData (all rows are iterated by .NET)
				/*	new SqlCube(
						"northwind-customers",
						new PivotDataConfiguration() {
							// dimensions should correspond to colums returned by SQL query
							Dimensions = new[]{ "ContactTitle","Country","City","CompanyName","ContactName"},

							// aggregator arguments also should correspond to columns returned by SQL query
							Aggregators = new[] {
								new AggregatorFactoryConfiguration("Count",null)
							}
						},
						new System.Data.SQLite.SQLiteConnection("Data Source="+ System.Web.HttpContext.Current.Server.MapPath("~/App_Data/northwind.db") ),
						"SELECT * from [Customers]"
					) {
						Name = "Northwind DB Customers (SQL data source)"
					},

					new ElasticSearchCube(
						"bank-accounts", 
						new PivotDataConfiguration() {
							Dimensions = new[] {"age", "gender.keyword", "employer.keyword", "state.keyword", "city.keyword", "firstname.keyword", "lastname.keyword" },
							Aggregators = new[] {
								new AggregatorFactoryConfiguration("Count",null),
								new AggregatorFactoryConfiguration("Average",new object[]{"age"}),
								new AggregatorFactoryConfiguration("Min",new object[]{"age"}),
								new AggregatorFactoryConfiguration("Max",new object[]{"age"}),
								new AggregatorFactoryConfiguration("Average",new object[]{"balance"}),
								new AggregatorFactoryConfiguration("Sum",new object[]{"balance"}),
								new AggregatorFactoryConfiguration("Min",new object[]{"balance"}),
								new AggregatorFactoryConfiguration("Max",new object[]{"balance"})
							}
						},
						new Elasticsearch.Net.ElasticLowLevelClient(
							new Elasticsearch.Net.ConnectionConfiguration(
								new Uri("https://site:nxxr8qt7n26c7jwijhwg1ipnarf402yn@thorin-us-east-1.searchly.com"))),
						"bank", "_doc"
					) {
						Name = "Bank Accounts (ElasticSearch)"
					},*/

					// you can implement your own ICube implementation for data sources you want to use:
					// CSV file, MongoDb, SSAS OLAP server, Google BigQuery etc

					// example of SSAS OLAP server data source
					// to run this example:
					// - include 'Services\MdxAdomdCube.cs' into the project
					// - add reference to 'Microsoft.AnalysisServices.AdomdClient' assembly (or install 'Microsoft.AnalysisServices.AdomdClient.retail.amd64' nuget package)
					// - ensure that you have all prerequisities mentioned in "ToolkitAdomdSource" example

					/*new MdxAdomdCube(
						"olapsource",
						new PivotDataConfiguration() {
							// dimensions should correspond to OLAP cube dimensions
							Dimensions = new[]{ "[JobTitle]", "[Agency]", "[HireDate]", "[HireDate].[Year]", "[HireDate].[Month]", "[HireDate].[Day]"},

							// with MdxAdomdCube use only "First" aggregator
							Aggregators = new[] {
								new AggregatorFactoryConfiguration("First", new object[] {"[Measures].[Count]"}),
								new AggregatorFactoryConfiguration("First", new object[] {"[Measures].[Sum of AnnualSalary]"})
							}
						},
						
						new Microsoft.AnalysisServices.AdomdClient.AdomdConnection("Data Source="+System.Web.HttpContext.Current.Server.MapPath("~/App_Data/test.cub"),
						"SELECT {0} from [Baltimore City Employee Salaries]"
					) {
						Name = "OLAP data source"
					}*/
				}
			);
		}

		public ActionResult ReportBuilder() {
			var cubeSchemas = pvtRepository.GetCubes().Select( c=> new CubeSchema(c.Id, c.Name, c.GetConfiguration() ) ).ToArray();
			return View(cubeSchemas);
		}

		public ActionResult PivotTableHtml(PivotTableReportConfig pvtReportCfg) {
			var pvtTbl = pvtRepository.CreatePivotTable(pvtReportCfg, true);
			var strWr = new StringWriter();
			var pvtHtmlWr = new PivotTableHtmlWriter(strWr);
			var expandCollapseEnabled = pvtReportCfg.ExpandCollapse != null && pvtReportCfg.ExpandCollapse.Enabled;
			if (expandCollapseEnabled)
				pvtHtmlWr.CollapseConfiguration = pvtReportCfg.ExpandCollapse;

			ApplyHtmlWriterOptions(pvtHtmlWr, pvtReportCfg);

			pvtHtmlWr.RenderSortIndexAttr = true;
			pvtHtmlWr.RenderKeyIndexAttr = true;
			pvtHtmlWr.RenderValueIndexAttr = true;
			pvtHtmlWr.Write(pvtTbl);

			var jsonWr = new StringWriter();
			var pvtJsonWr = new PivotTableJsonWriter(jsonWr);
			pvtJsonWr.IncludeValues = false;
			pvtJsonWr.IncludeTotals = false;
			pvtJsonWr.Write(pvtTbl);

			var resultPvtCfg = pvtReportCfg.GetPivotTableConfig(pvtRepository.GetCube(pvtReportCfg.CubeName).GetConfiguration());
			// lets validate and remove invalid sort options if present
			ValidateSortOptions(resultPvtCfg, pvtTbl);

			// this structure is expected by front-end part of pivot builder
			return Json(new {
				Configuration = resultPvtCfg,  // this configuration reflects actual state of the rendered table
				HtmlContent = strWr.ToString(),
				JsonData = jsonWr.ToString()
			});
		}

		void ValidateSortOptions(PivotTableConfiguration pvtTblCfg, IPivotTable pvtTbl) {
			if (pvtTblCfg.SortByValue != null) {
				var axisKeysCount = pvtTblCfg.SortByValue.Axis == PivotTableConfiguration.TableAxis.Rows ? pvtTbl.ColumnKeys.Length : pvtTbl.RowKeys.Length;
				if ((pvtTblCfg.SortByValue.Measure.HasValue && pvtTblCfg.SortByValue.Measure.Value >= pvtTblCfg.Measures.Length) ||
					(pvtTblCfg.SortByValue.Index.HasValue && pvtTblCfg.SortByValue.Index.Value>=axisKeysCount))
					pvtTblCfg.SortByValue = null;
			}
			if (pvtTblCfg.OrderKeys != null)
				pvtTblCfg.OrderKeys = pvtTblCfg.OrderKeys.Where(
					sortByKey => {
						var dimCount = sortByKey.Axis == PivotTableConfiguration.TableAxis.Rows ? pvtTbl.Rows.Length : pvtTbl.Columns.Length;
						if (sortByKey.Index >= dimCount)
							return false;
						return true;
					}	
				).ToArray();
		}

		void ApplyBaseWriterOptions(PivotTableWriterBase pvtWr, PivotTableReportConfig pvtReportCfg) {
			pvtWr.GrandTotal = pvtReportCfg.GrandTotal;
			pvtWr.TotalsColumn = pvtReportCfg.TotalsColumn;
			pvtWr.TotalsColumnPosition = pvtReportCfg.TotalsColumnPosition;
			pvtWr.TotalsRow = pvtReportCfg.TotalsRow;
			pvtWr.TotalsRowPosition = pvtReportCfg.TotalsRowPosition;
		}

		void ApplyHtmlWriterOptions(PivotTableHtmlWriter pvtHtmlWr, PivotTableReportConfig pvtReportCfg) {
			ApplyBaseWriterOptions(pvtHtmlWr, pvtReportCfg);
			pvtHtmlWr.SubtotalColumns = pvtReportCfg.SubtotalColumns;
			pvtHtmlWr.SubtotalRows = pvtReportCfg.SubtotalRows;

			// use FormatValue property to specify custom value formatting rules
			pvtHtmlWr.FormatValue = (aggr,idx) => {
				
				if (idx < pvtReportCfg.Measures.Length) {
					var msr = pvtReportCfg.Measures[idx];
					// percentage formatting
					if (msr.Percentage.HasValue)
						return aggr.Count>0 ? String.Format("{0:0.##}%", aggr.Value) : String.Empty;

					// difference formatting
					if (msr.Difference.HasValue) {
						return String.Format(
							msr.DifferenceAsPercentage ? @"{0:+0.##\%;-0.##\%;0\%}":@"{0:+0.##;-0.##;0}", 
							aggr.Value);
					}
				}

				// default number formatting
				return String.Format("{0:#,#.##}", aggr.Value); 
			};

			// use FormatKey property to specify custom formatting for dimension keys (row/column labels)
			pvtHtmlWr.FormatKey = (key, dim) => {
				var kStr = Convert.ToString(key);
				return String.IsNullOrWhiteSpace(kStr) ? "(empty)" : kStr;
			};
		}

		public ActionResult Export(string format, string pvtConfigJson) {
			var pvtReportCfg = new JavaScriptSerializer().Deserialize<PivotTableReportConfig>(pvtConfigJson);
			var pvtTbl = pvtRepository.CreatePivotTable(pvtReportCfg, false);

			switch (format) {
				case "csv":
					return new ExportResult( (stream) => {
						using (var streamWr = new StreamWriter(stream)) {
							var pvtCsvWr = new PivotTableCsvWriter(streamWr);
							ApplyBaseWriterOptions(pvtCsvWr, pvtReportCfg);
							pvtCsvWr.Write(pvtTbl);
						}
					}, "text/csv", "Export.csv");
				case "excel":
					return new ExportResult( (stream) => {
						var pvtExcelWr = new PivotTableExcelWriter(stream, "Report");
						ApplyBaseWriterOptions(pvtExcelWr, pvtReportCfg);
						pvtExcelWr.SubtotalColumns = pvtReportCfg.SubtotalColumns;
						pvtExcelWr.SubtotalRows = pvtReportCfg.SubtotalRows;
						pvtExcelWr.Write(pvtTbl);
					}, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Export.xlsx");
				case "pdf":
					return new ExportResult( (stream) => {
						var strWr = new StringWriter();
						using (strWr) {
							var pvtHtmlWr = new PivotTableHtmlWriter(strWr);
							ApplyHtmlWriterOptions(pvtHtmlWr, pvtReportCfg);
							pvtHtmlWr.RenderTheadTbody = true; // lets wrap column labels with THEAD (PdfGenerator will repeat them on every page)
							pvtHtmlWr.Write(pvtTbl);
							// use NReco.PdfGenerator for converting HTML to PDF
							var pdfGenerator = new NReco.PdfGenerator.HtmlToPdfConverter();
							pdfGenerator.GeneratePdf( FormatHtmlForPdf( strWr.ToString() ),null, stream);
						}
					}, "application/pdf", "Export.pdf");
				case "json":
					return new ExportResult( (stream) => {
						using (var streamWr = new StreamWriter(stream)) {
							var pvtJsonWr = new PivotTableJsonWriter(streamWr);
							pvtJsonWr.Write(pvtTbl);
						}
					}, "application/json", "pivot_table_data.json");
			}
			throw new Exception(String.Format("Unknown format: {0}",format));
		}

		string FormatHtmlForPdf(string pivotTableHtml) {
			var sb = new StringBuilder();
			sb.Append("<html><head><meta http-equiv='content-type' content='text/html; charset=utf-8' /><style>table {border-collapse: collapse;width:100%;font-familty:Arial;font-size:10px;} td,th {border:1px solid silver;padding:2px;} td {text-align:right;} th {text-align:center;} td, th, tr { page-break-inside: avoid !important; }</style></head><body>");
			sb.Append(pivotTableHtml);
			sb.Append("</body></html>");
			return sb.ToString();
		}

		public class ExportResult : ActionResult {
			Action<Stream> WriteData;
			string FileName;
			string ContentType;

			public ExportResult(Action<Stream> writeData, string contentType, string fileName) {
				WriteData = writeData;
				ContentType = contentType;
				FileName = fileName;
			}
			public override void ExecuteResult(ControllerContext context) {				
				context.HttpContext.Response.ContentType = ContentType;
				context.HttpContext.Response.AddHeader("Content-Disposition", String.Format("attachment; filename={0}", FileName));
				WriteData(context.HttpContext.Response.OutputStream);
			}
		}


	}
}
