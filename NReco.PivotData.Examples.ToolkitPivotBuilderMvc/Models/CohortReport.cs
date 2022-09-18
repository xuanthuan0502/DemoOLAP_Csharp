using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;

using System.ComponentModel.DataAnnotations;

namespace Models {
	
	public class CohortReport {

		public string PivotTableJson { get; set; }
		public string PivotTableHtml { get; set; }

	}
}