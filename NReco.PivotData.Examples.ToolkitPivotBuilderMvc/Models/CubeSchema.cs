using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;

using NReco.PivotData;

namespace Models {

	public class CubeSchema {

		public string Id { get; set; }
		public string Name { get; set; }

		public CubeMemberSchema[] Dimensions { get; set; }

		public CubeMemberSchema[] Measures { get; set; }

		public CubeSchema(string id, string name, PivotDataConfiguration cubeCfg) {
			Id = id;
			Name = name;
			Dimensions = cubeCfg.Dimensions.Select(d => new CubeMemberSchema() { LabelText = d, Name = d } ).ToArray();
			
			Measures = cubeCfg.Aggregators.Select( (m, i) => new CubeMemberSchema() {
				Name = i.ToString(),
 				LabelText = FormatMeasureLabel(m)
			}).ToArray();
		}

		string FormatMeasureLabel(AggregatorFactoryConfiguration aggr) {
			var lbl = aggr.Name;
			if (aggr.Params!=null && aggr.Params.Length>0)
				lbl += " of "+String.Join(", ", aggr.Params.Select(p=>p.ToString()).ToArray() );
			return lbl;
		}

		public class CubeMemberSchema {
			public string Name { get; set; }
			public string LabelText { get; set; }
		}
	}
}