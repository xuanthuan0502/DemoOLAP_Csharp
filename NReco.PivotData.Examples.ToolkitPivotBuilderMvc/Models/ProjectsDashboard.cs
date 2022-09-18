using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;

using System.ComponentModel.DataAnnotations;

namespace Models {
	
	public class ProjectsDashboard {

		public string CompletionPivotTableJson { get; set; }
		public string CompletionPivotTableHtml { get; set; }

		public string ActiveTasksByTypePvtTblJson { get; set; }
		public string ClosedTasksByTypePvtTblJson { get; set; }
		public string TasksByTypePivotTableHtml { get; set; }
	}
}