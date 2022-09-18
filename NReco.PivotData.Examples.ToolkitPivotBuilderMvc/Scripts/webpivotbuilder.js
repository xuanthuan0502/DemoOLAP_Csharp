//
// PivotData Web Pivot Builder Example
//
// Implements UI for building web pivot tables with PivotData backend and the following jQuery plugins:
// - NRecoPivotTable and NRecoPivotChart
// - select2 ( https://select2.github.io/, both 3.5.4 and 4.0.12+ are supported)
// - ChartistJS ( https://gionkunz.github.io/chartist-js/ ), other charts may be used instead see https://github.com/nreco/pivotdata
// - Bootstrap-3-Typeahead ( https://github.com/bassjobsen/Bootstrap-3-Typeahead )
// - sortable ( https://github.com/SortableJS/Sortable, used for select2 drag-and-drop, optional)

(function ($) {

	function PivotDataWebPivotBuilder(element, options) {
		this.element = element;
		this.options = options;
		this.currentCubeId = null;
		this.currentPivotData = null;

		init(this);
	}

	function init(pvtBuilder) {
		var $el = pvtBuilder.element;
		pvtBuilder.$el = $el;
		pvtBuilder.cubes = [];

		pvtBuilder.$cubeSelect = $el.find(pvtBuilder.options.selectors.cubeSelect);
		pvtBuilder.$cubeSelect.change(function () {
			pvtBuilder.setCurrentCubeId( $(this).val() );
		});

		pvtBuilder.$chartSelect = $el.find(pvtBuilder.options.selectors.chartSelect);
		pvtBuilder.$pivotChart = $el.find(pvtBuilder.options.selectors.pivotChart);

		pvtBuilder.$rowDims = applySelect2($el.find(pvtBuilder.options.selectors.rowDims));
		pvtBuilder.$columnDims = applySelect2($el.find(pvtBuilder.options.selectors.columnDims));
		pvtBuilder.$measures = applySelect2($el.find(pvtBuilder.options.selectors.measures));

		pvtBuilder.$filter = $el.find(pvtBuilder.options.selectors.filter);
		if (pvtBuilder.$filter.length>0)
			applyFilterTypeahead(pvtBuilder.$filter, pvtBuilder);

		// refresh pivot table on filter enter
		pvtBuilder.$filter.keypress(function (e) {
			if (e.which == 13) {
				pvtBuilder.render();
				return false;
			}
		});

		// hide popover on outside click
		if (pvtBuilder.options.drillDown) {
			pvtBuilder.drillDownManager = new DrillDownManager(pvtBuilder);
		}

		pvtBuilder.$pivotTable = applyPivotTable($el.find(pvtBuilder.options.selectors.pivotTable), pvtBuilder);
		pvtBuilder.$pivotTable.on("pvt.loaded", function () {
			pvtBuilder.options.onPivotTableRendered();
		});

		pvtBuilder.options.onLoadCubes(function (cubes) {
			pvtBuilder.cubes = cubes;

			// populate cube select
			if (pvtBuilder.$cubeSelect.length > 0) {
				pvtBuilder.$cubeSelect.remove('option');
				for (var i = 0; i < cubes.length; i++) {
					pvtBuilder.$cubeSelect.append($('<option/>', { value: cubes[i].Id, text: cubes[i].Name }))
				}
				pvtBuilder.$cubeSelect.change(); // force reload
			} else {
				if (cubes.length>0)
					pvtBuilder.setCurrentCubeId(cubes[0].Id);
			}
		});
	}

	function applyPivotTable($el, pvtBuilder) {

		// browser detection for fixed header options
		var isIE = (navigator.userAgent.indexOf('MSIE') !== -1 || navigator.appVersion.indexOf('Trident/') > 0);
		var isEdgeWithStickyBug = false;
		var edgeMatch = navigator.userAgent.match(/Edge[\/]([0-9.])+/g);
		if (edgeMatch) {
			var edgeHtmlVer = parseFloat(edgeMatch[0].split('\/')[1]);
			isEdgeWithStickyBug = edgeHtmlVer < 17;
		}
		var isChrome = navigator.userAgent.indexOf('Chrome') !== -1;
		if (isChrome)
			$el.addClass("pvtStickyChromeFixedHeader");

		$el.nrecoPivotTable({
			renderTable: function (pivotTable, callback) {
				var cubeId = pvtBuilder.getCurrentCubeId();
				var cfg = pvtBuilder.getPivotTableConfig();

				if (pvtBuilder.options.drillDown && pvtBuilder.drillDownManager) {
					pvtBuilder.drillDownManager.destroyLastPopover();
				}

				pvtBuilder.options.onLoadPivotHtml(cubeId, cfg, function (res) {
					if (!res.Configuration.ColumnPage)
						res.Configuration.ColumnPage = cfg.ColumnPage;
					if (!res.Configuration.RowPage)
						res.Configuration.RowPage = cfg.RowPage;
					if (!res.Configuration.ExpandCollapse && cfg.ExpandCollapse && cfg.ExpandCollapse.Enabled)
						res.Configuration.ExpandCollapse = cfg.ExpandCollapse;

					pvtBuilder.currentPivotData = $.parseJSON(res.JsonData);
					callback(res.HtmlContent, res.Configuration);

					if (pvtBuilder.options.drillDown && pvtBuilder.drillDownManager) {
						var $pvtTblEl = $el.find('table.pvtTable');
						$pvtTblEl.addClass('pvtDrillDown');
					}
				});
			},
			fixedHeaders: true,
			fixedHeadersUseSticky: isEdgeWithStickyBug || isIE ? false : null,
			fixedHeadersSmooth: false
		}).bind("sortChanged pageChanged expandCollapseChanged", function () {
			$(this).nrecoPivotTable("load");
		});

		if (pvtBuilder.options.drillDown && pvtBuilder.drillDownManager) {
			$el.on("click", "td[data-value-index]", function () {
				var $cell = $(this);
				pvtBuilder.drillDownManager.handleDrillDown($cell, $cell.attr("data-value-index"));
			});
		}

		return $el;
	}

	function applySelect2($el, data) {
		if (!data)
			data = [];
		$el.select2({
			minimumInputLength: 0,
			multiple: true,
			data: data,
			// for 4.0.12
			theme: "bootstrap",
			templateSelection: function (item) {
				return $('<span class="select2-item-text"/>').data('id', item.id).text(item.text);
			}
		});

		var select2Obj = $el.data("select2");
		if (select2Obj.container) {
			// this is select2 3.x
			new Sortable(select2Obj.container.find("ul.select2-choices")[0], {
				filter: ".select2-search-field",
				touchStartThreshold: 3,
				animation: 150,
				onStart: function () { $el.select2("onSortStart"); },
				onUpdate: function () { $el.select2("onSortEnd"); },
				onEnd: function () { $el.select2("onSortEnd"); }
			});
		} else if (select2Obj.$container) {
			// this is select2 4.0.12+
			$el.on('change', function (e) {
				var $container = $(this).data("select2").$container;
				var $elems = $container.find("li:not(.select2-search)");
				var $searchEl = $container.find("li.select2-search");
				var selectedVals = $(this).val().split(",");
				// remove duplicates
				var uniqSelectedVals = [];
				for (var i = 0; i < selectedVals.length; i++)
					if ($.inArray(selectedVals[i], uniqSelectedVals) < 0)
						uniqSelectedVals.push(selectedVals[i]);
				if (uniqSelectedVals.length < selectedVals.length)
					$(this).val(uniqSelectedVals.join(","));
				// reorder selected item elems because select2 4.x always renders them in 'data' order
				$elems.detach();
				$.each(uniqSelectedVals, function (i, id) {
					var elById = $.grep($elems, function (el) { return $(el).find(".select2-item-text").data("id") == id; });
					$(elById).insertBefore($searchEl);
				});
			}).change();

			new Sortable(select2Obj.$container.find("ul")[0], {
				filter: ".select2-search",
				touchStartThreshold: 3,
				animation: 150,
				onEnd: function () {
					var val = [];
					select2Obj.$container.find("li:not(.select2-search)").each(function () {
						val.push($(this).find(".select2-item-text").data("id"));
					});
					$el.val(val.join(","));
				}
			});
		}
		return $el;
	}

	function applyFilterTypeahead($filter, pvtBuilder) {
		if (!$.fn.typeahead)
			return;
		var pivotDataKeysMatcher = function (pvtBuilder) {
			var addKeys = function (q, dimKeys, keywords) {
				var qLowerCase = q.toLowerCase();
				var addedKeys = {};
				for (var i = 0; i < dimKeys.length; i++) {
					var dimKey = dimKeys[i];
					for (var j = 0; j < dimKey.length; j++) {
						var keyStr = dimKey[j] != null ? dimKey[j].toString() : "";
						if (keyStr.toLowerCase().indexOf(qLowerCase) >= 0 && !addedKeys[keyStr]) {
							keywords.push(keyStr);
							addedKeys[keyStr] = true;
						}
					}
				}
			};
			return function findMatches(q, cb) {
				matches = [];
				var lastKeyword = $.trim(q.match(/[^+;,-]*$/)[0]);
				var cursorPos = $filter[0].selectionStart;
				if (lastKeyword.length == 0 || cursorPos < (q.length - lastKeyword.length)) {
					cb(matches);
					return;
				}
				$filter.data('typeahead').query = lastKeyword;
				var pvtTblData = pvtBuilder.currentPivotData;
				if (!pvtTblData)
					return matches;
				addKeys(lastKeyword, pvtTblData.ColumnKeys, matches);
				addKeys(lastKeyword, pvtTblData.RowKeys, matches);
				cb(matches);
			};
		};
		var isSeparator = function (ch) { return ch == "," | ch == ";"; };
		var typeaheadOpts = {
			source: pivotDataKeysMatcher(pvtBuilder),
			autoSelect: false,
			minLength: 1,
			items: 5,
			afterSelect: function () { $filter.blur().focus(); },
			updater: function (text) {
				var val = $filter.val();
				var lastKeyword = val.match(/[^+;,-]*$/)[0];
				var before = val.substring(0, val.length - lastKeyword.length);
				return (before.length > 0 && isSeparator(before[before.length - 1]) ? before + " " : before) + text + ", ";
			}
		};
		if (pvtBuilder.options.selectors.typeaheadAppendTo)
			typeaheadOpts.appendTo = $(pvtBuilder.options.selectors.typeaheadAppendTo)
		$filter.typeahead(typeaheadOpts);
	}

	function findCubeById(cubes, cubeId) {
		for (var i = 0; i < cubes.length; i++)
			if (cubes[i].Id == cubeId)
				return cubes[i];
		return null;
	}

	PivotDataWebPivotBuilder.prototype.getCurrentCubeId = function () {
		return this.$cubeSelect.length>0 ? this.$cubeSelect.val() : this.currentCubeId;
	};

	PivotDataWebPivotBuilder.prototype.setCurrentCubeId = function (cubeId) {
		this.currentCubeId = cubeId;
		this.setPivotTableConfig(cubeId, null);
		if (this.options.onCubeChanged) {
			var cubeMetadata = findCubeById(this.cubes, cubeId);
			if (cubeMetadata)
				this.options.onCubeChanged(cubeMetadata);
		}
		if (this.options.renderOnCubeChange)
			this.render();
	};

	PivotDataWebPivotBuilder.prototype.getPivotTableConfig = function () {
		var valueModifier = this.$el.find(this.options.selectors.valueModifier).val();
		var getValueModifierFor = function(prefix) {
			if (valueModifier && valueModifier.indexOf(prefix)==0)
				return valueModifier.substring(prefix.length);
			return null;
		};
		var getCheckboxState = function ($chkbox, defaultVal) {
			if ($chkbox.length == 0)
				return defaultVal;
			return $chkbox.is(':checked');
		};
		var getSelect2Val = function ($el) {
			var val = $el.select2('val');
			if (typeof val === "string") {
				// select2 4.x
				return val.split(",");
			} else {
				// select2 3.x val is an array
				return val;
			}
		};

		var heatmapMode = this.$el.find(this.options.selectors.heatmap).val();
		var rowDimVals = $.map( getSelect2Val(this.$rowDims), function (dimName) { return { Name: dimName }; });
		var colDimVals = $.map( getSelect2Val(this.$columnDims), function (mName) { return { Name: mName }; });
		var measureVals = $.map(getSelect2Val(this.$measures), function (mName) {
			return {
				Name: mName,
				Percentage: getValueModifierFor("Percentage"),
				RunningTotal: getValueModifierFor("RunningTotal"),
				Difference: getValueModifierFor("DifferencePercentage") || getValueModifierFor("Difference"),
				DifferenceAsPercentage: (valueModifier && valueModifier.indexOf("DifferencePercentage") == 0) || false,
				Heatmap: heatmapMode
			};
		});
		var $preserveGroupOrderEl = this.$el.find(this.options.selectors.preserveGroupOrder);
		var pivotTableConfig = {
			Rows: rowDimVals,
			Columns: colDimVals,
			Measures: measureVals,
			OrderBy: {
				PreserveGroupOrder: getCheckboxState($preserveGroupOrderEl, false ),
			},
			SubtotalColumns: getCheckboxState(this.$el.find(this.options.selectors.subtotalColumns), false ),
			SubtotalRows: getCheckboxState(this.$el.find(this.options.selectors.subtotalRows), false ),
			GrandTotal: getCheckboxState(this.$el.find(this.options.selectors.grandTotal), true ),
			TotalsRow: getCheckboxState(this.$el.find(this.options.selectors.totalsRow), true),
			TotalsColumn: getCheckboxState(this.$el.find(this.options.selectors.totalsColumn), true),
			TotalsRowPosition: this.$el.find(this.options.selectors.totalsRowPosition).val(),
			TotalsColumnPosition: this.$el.find(this.options.selectors.totalsColumnPosition).val(),
			LimitRows: this.$el.find(this.options.selectors.limitRows).val(),
			LimitColumns: this.$el.find(this.options.selectors.limitColumns).val(),
			Filter: this.$filter.val()
		};
		if (pivotTableConfig.SubtotalColumns || pivotTableConfig.SubtotalRows)
			pivotTableConfig.OrderBy.PreserveGroupOrder = true;
		if (this.$chartSelect.length>0)
			pivotTableConfig.ChartType = this.$chartSelect.val();

		var uiConfig = this.$pivotTable.nrecoPivotTable("getPivotTableConfig");
		if (uiConfig != null) {
			pivotTableConfig.OrderBy.Values = uiConfig.SortByValue;
			pivotTableConfig.OrderBy.Dimensions = uiConfig.OrderKeys;
			pivotTableConfig.ColumnPage = uiConfig.ColumnPage ? uiConfig.ColumnPage : { Offset: 0, Limit: 100 };
			pivotTableConfig.RowPage = uiConfig.RowPage ? uiConfig.RowPage : { Offset: 0, Limit: 100 };
			pivotTableConfig.ExpandCollapse = $.extend(true, {}, uiConfig.ExpandCollapse);
			if (!pivotTableConfig.ExpandCollapse)
				pivotTableConfig.ExpandCollapse = {};
			pivotTableConfig.ExpandCollapse.Enabled = getCheckboxState(this.$el.find(this.options.selectors.expandCollapse), false);
			if (pivotTableConfig.ExpandCollapse.Enabled) {
				pivotTableConfig.OrderBy.PreserveGroupOrder = true;
			}
		}
		if (pivotTableConfig.OrderBy.PreserveGroupOrder)
			$preserveGroupOrderEl.prop('checked', true);
		if (typeof this.options.onComposePivotConfig == "function")
			this.options.onComposePivotConfig(pivotTableConfig);
		return pivotTableConfig;
	};

	PivotDataWebPivotBuilder.prototype.setPivotTableConfig = function (cube, pivotConfig) {
		this.$cubeSelect.val(cube);

		var newCubeInfo = findCubeById(this.cubes, cube);
		if (newCubeInfo == null) return;
		var dimsForPivot = $.grep(newCubeInfo.Dimensions, function (d) { return d.ReportType == null || d.ReportType == "Pivot" || d.ReportType == "Any"; });

		if (!pivotConfig) {
			pivotConfig = {
				"Rows": [], "Columns": [], "Measures": [],
				"SubtotalColumns": false,
				"SubtotalRows": false,
				"GrandTotal": true,
				"TotalsRow": true,
				"TotalsColumn": true,
				"Filter": ""
			};
			// default report configuration
			if (!this.options.allowEmptyReport && dimsForPivot.length > 0)
				pivotConfig.Rows.push({ "Name": dimsForPivot[0].Name });
			if (!this.options.allowEmptyReport && dimsForPivot.length > 1)
				pivotConfig.Columns.push({ "Name": dimsForPivot[1].Name });
			if (!this.options.allowEmptyReport && newCubeInfo.Measures.length > 0)
				pivotConfig.Measures.push({ "Name": newCubeInfo.Measures[0].Name });
		}
		this.$el.find(this.options.selectors.subtotalColumns).prop('checked', pivotConfig.SubtotalColumns ? true : false);
		this.$el.find(this.options.selectors.subtotalRows).prop('checked', pivotConfig.SubtotalRows ? true : false);
		this.$el.find(this.options.selectors.grandTotal).prop('checked', pivotConfig.GrandTotal ? true : false);
		this.$el.find(this.options.selectors.totalsRow).prop('checked', pivotConfig.TotalsRow ? true : false);
		this.$el.find(this.options.selectors.totalsColumn).prop('checked', pivotConfig.TotalsColumn ? true : false);
		this.$el.find(this.options.selectors.preserveGroupOrder).prop('checked', pivotConfig.OrderBy && pivotConfig.OrderBy.PreserveGroupOrder ? true : false);
		this.$el.find(this.options.selectors.expandCollapse).prop('checked', pivotConfig.ExpandCollapse && pivotConfig.ExpandCollapse.Enabled ? true : false);
		this.$el.find(this.options.selectors.limitRows).val(pivotConfig.LimitRows);
		this.$el.find(this.options.selectors.limitColumns).val(pivotConfig.LimitColumns);
		this.$el.find(this.options.selectors.totalsRowPosition).val(pivotConfig["TotalsRowPosition"] ? pivotConfig["TotalsRowPosition"] : "Last");
		this.$el.find(this.options.selectors.totalsColumnPosition).val(pivotConfig["TotalsColumnPosition"] ? pivotConfig["TotalsColumnPosition"] : "Last");

		var valueModifier = "";
		if (pivotConfig.Measures.length > 0) {
			var msr = pivotConfig.Measures[0];
			if (msr.Percentage) {
				valueModifier = "Percentage" + msr.Percentage;
			} else if (msr.Difference) {
				valueModifier = "Difference" + (msr.DifferenceAsPercentage ? "Percentage" : "") + msr.Difference;
			} else if (msr.RunningTotal) {
				valueModifier = "RunningTotal" + msr.RunningTotal;
			}
		}
		this.$el.find(this.options.selectors.valueModifier).val(valueModifier);
		this.$el.find(this.options.selectors.heatmap).val(pivotConfig.Measures.length > 0 ? pivotConfig.Measures[0].Heatmap : "");

		this.$chartSelect.val(pivotConfig.ChartType);
		var dimOptions = $.map(dimsForPivot, function (dimInfo, i) {
			return { id: dimInfo.Name, text: dimInfo.LabelText != null ? dimInfo.LabelText : dimInfo.Name };
		});
		var measureOptions = $.map(newCubeInfo.Measures, function (measureInfo, i) {
			var labelText = measureInfo.LabelText;
			if (labelText == null) {
				var labelText = measureInfo.Type;
				var fldName = measureInfo.Params && measureInfo.Params.length > 0 ? measureInfo.Params[0] : null;
				if (fldName != null)
					labelText += " of " + fldName;
			}
			return { id: measureInfo.Name, text: labelText };
		});


		this.$rowDims.val($.map(pivotConfig.Rows, function (val) { return val.Name; }));
		applySelect2(this.$rowDims, dimOptions);

		this.$columnDims.val($.map(pivotConfig.Columns, function (val) { return val.Name; }));
		applySelect2(this.$columnDims, dimOptions);

		this.$measures.val($.map(pivotConfig.Measures, function (val) { return val.Name; }));
		applySelect2(this.$measures, measureOptions);

		// clear filter
		this.$filter.val(pivotConfig.Filter);

		var uiConfig = {};
		if (pivotConfig.OrderBy) {
			uiConfig.SortByValue = pivotConfig.OrderBy.Values;
			uiConfig.OrderKeys = pivotConfig.OrderBy.Dimensions;
		}
		if (pivotConfig.ColumnPage)
			uiConfig.ColumnPage = pivotConfig.ColumnPage;
		if (pivotConfig.RowPage)
			uiConfig.RowPage = pivotConfig.RowPage;
		if (pivotConfig.ExpandCollapse && pivotConfig.ExpandCollapse.Enabled)
			uiConfig.ExpandCollapse = pivotConfig.ExpandCollapse;
		this.$pivotTable.nrecoPivotTable("setPivotTableConfig", uiConfig);

	};

	PivotDataWebPivotBuilder.prototype.render = function (isDrillDown) {
		this.renderPivotTable();
		if (this.$pivotChart.length>0)
			this.renderPivotChart();
		if (!isDrillDown && this.drillDownManager)
			this.drillDownManager.clearHistory();
	};

	PivotDataWebPivotBuilder.prototype.renderPivotTable = function () {
		this.$pivotTable.show();
		this.$pivotTable.nrecoPivotTable("load");
	};

	PivotDataWebPivotBuilder.prototype.renderPivotChart = function () {
		var pvtBuilder = this;
		var chartType = this.$chartSelect.val();
		if (chartType != "") {
			this.$pivotChart.show();

			var cubeId = pvtBuilder.getCurrentCubeId();
			var cfg = pvtBuilder.getPivotTableConfig();
			this.options.onLoadPivotJson(cubeId, cfg, function (res) {
				var chartId = "pivotChart" + (new Date().getTime());
				var chartHeight = parseInt( pvtBuilder.$pivotChart.data('height') );
				if (!chartHeight)
					chartHeight = 400;
				pvtBuilder.$pivotChart.html('<div id="' + chartId + '" class="ct-chart" style="height:' + chartHeight + 'px;"></div>');
				var $chartElem = $('#' + chartId); // chart element should have ID for correct initialization

				// some chart styling
				var pvtChartOpts = {
					created : function() {
						pvtBuilder.options.onPivotChartRendered();
					},
					pivotData: res,
					chartType: chartType,
					animation:1000
				};
				// this is chartist.js specific options
				if (typeof Chartist !== "undefined") {
					pvtChartOpts.chartOptions = {
						axisY: { offset: 60, showGrid: chartType.indexOf("horizontal") != 0 },
						axisX: { offset: 35, showGrid: chartType.indexOf("horizontal") == 0 },
						height: chartHeight,
						plugins: [
							// optional chart plugin: tooltip on mouse over
							Chartist.plugins.tooltip({
								tooltipOffset: { x: 0, y: -10 },
								metaIsHTML: true,
								appendToBody: true
							})
						]
					};
					if (chartType == 'pie') {
						pvtChartOpts.chartOptions.chartPadding = 20;
						pvtChartOpts.chartOptions.labelOffset = 10;
						pvtChartOpts.chartOptions.labelPosition = 'outside';
						pvtChartOpts.chartOptions.labelDirection = 'explode';
					} else {
						// optional chart plugin: render axes labels
						pvtChartOpts.initAxesLabels = function (labelInfo) {
							labelInfo.chartOptions.plugins.push(
								Chartist.plugins.ctAxisTitle({
									axisX: {
										axisTitle: labelInfo.axisXLabel,
										axisClass: 'ct-axis-title ct-label',
										offset: { x: 0, y: 35 },
										textAnchor: 'middle'
									},
									axisY: {
										axisTitle: labelInfo.axisYLabel,
										axisClass: 'ct-axis-title ct-label',
										flipTitle: true,
										offset: { x: 0, y: 15 },
										textAnchor: 'middle'
									}
								})
							);
						};
					}
				}
				// build pivot chart with Chartist.js library
				$chartElem.nrecoPivotChart(pvtChartOpts);
			});

		} else {
			this.$pivotChart.hide();
		}
		
	}

	PivotDataWebPivotBuilder.prototype.destroy = function () {
		if (this.drillDownManager)
			this.drillDownManager.destroy();
		if ($.fn.typeahead)
			this.$filter.typeahead('destroy');
	};

	/* Drill-Down function */
	function DrillDownManager(pvtBuilder) {
		this.pvtBuilder = pvtBuilder;
		this.$lastPopoverEl = null;
		this.drillDownStack = [];
		var drillDownMgr = this;

		this.onClickHandler = function (e) {
			var $target = $(e.target);
			if (drillDownMgr.$lastPopoverEl != null && !drillDownMgr.$lastPopoverEl.is(e.target) && $target.parents('.pvtPopover.popover.in').length === 0) {
				drillDownMgr.destroyLastPopover();
			}
		};
		$('body').on('click', this.onClickHandler);

		this.$drillUpEl = pvtBuilder.element.find('.drillUpBtn');
		this.refreshDrillUp();
		this.$drillUpEl.click(function () {
			if (drillDownMgr.drillDownStack.length > 0) {
				var savedState = drillDownMgr.drillDownStack.pop();
				drillDownMgr.refreshDrillUp();
				drillDownMgr.pvtBuilder.setPivotTableConfig(savedState.CubeId, savedState.Config);
				drillDownMgr.pvtBuilder.render(true);
			}
		});
	};
	DrillDownManager.prototype.destroy = function () {
		$('body').off('click', this.onClickHandler);
	};
	DrillDownManager.prototype.refreshDrillUp = function () {
		if (this.drillDownStack.length == 0) {
			this.$drillUpEl.hide()
		} else {
			this.$drillUpEl.show();
			this.$drillUpEl.find('.drillUpCount').text(this.drillDownStack.length);
		}
	};
	DrillDownManager.prototype.clearHistory = function () {
		this.drillDownStack = [];
		this.refreshDrillUp();
	};
	DrillDownManager.prototype.destroyLastPopover = function () {
		if (this.$lastPopoverEl != null) {
			var $el = this.$lastPopoverEl;
			this.$lastPopoverEl = null;
			if ($el.hasClass('pvtPopover'))
				$el.removeClass('pvtPopover').popover('destroy');
		}
	}
	DrillDownManager.prototype.handleDrillDown = function ($cellEl, cellIndex) {
		var pvtBuilder = this.pvtBuilder;
		if (pvtBuilder.currentPivotData == null) {
			return; // ignore
		}
		var isClickOnActiveCell = $cellEl.hasClass('pvtPopover');
		this.destroyLastPopover();
		if (isClickOnActiveCell)
			return;

		var menuContentHtml = '';
		var cubeId = pvtBuilder.getCurrentCubeId();
		var cubeMetadata = findCubeById(pvtBuilder.cubes, cubeId);
		var menuItemsCount = 0;
		var canDrillByDim = function (dim) {
			if (dim.Properties != null && (typeof dim.Properties["DrillDown"]) !== 'undefined') {
				var drillDown = dim.Properties["DrillDown"];
				if (!drillDown || drillDown.toLowerCase() === "false")
					return false;
			}
			return (dim.ReportType == null || dim.ReportType == "Pivot" || dim.ReportType == "Any") &&
				$.inArray(dim.Name, pvtBuilder.currentPivotData.Columns) < 0 &&
				$.inArray(dim.LabelText, pvtBuilder.currentPivotData.Columns) < 0 &&
				$.inArray(dim.Name, pvtBuilder.currentPivotData.Rows) < 0 &&
				$.inArray(dim.LabelText, pvtBuilder.currentPivotData.Rows) < 0;
		};
		for (var i = 0; i < cubeMetadata.Dimensions.length; i++) {
			var dim = cubeMetadata.Dimensions[i];
			if (canDrillByDim(dim)) {
				menuItemsCount++;
				var $el = $('<div class="drillDownAction"/>');
				$el.text(dim.LabelText ? dim.LabelText : dim.Name);
				$el.attr('dim-name', dim.Name);
				$el.attr('cell-index', cellIndex);
				menuContentHtml += $el[0].outerHTML;
			}
		}
		if (menuItemsCount == 0) {
			// no dimension to select. lets just apply the filter
			this.applyDrillDown(null, cellIndex);
			return;
		}

		var tplHtml = '<div class="popover pvtDrillDownMenu" role="tooltip"><div class="arrow"></div><h3 class="popover-title"></h3><div class="popover-content"></div></div>';
		this.$lastPopoverEl = $cellEl;
		$cellEl.popover({
			container: 'body',
			html: true,
			placement: 'auto bottom',
			content: menuContentHtml,
			template: tplHtml,
			title: 'Drill Down By',
			trigger: 'manual'
		}).addClass('pvtPopover').popover('show');
		var drillDownMgr = this;
		$cellEl.data('bs.popover').$tip.click(".drillDownAction", function (e) {
			var $target = $(e.target);
			drillDownMgr.applyDrillDown($target.attr('dim-name'), $target.attr('cell-index'));
		});
	};
	DrillDownManager.prototype.applyDrillDown = function (dimName, cellIndex) {
		var pvtBuilder = this.pvtBuilder;
		var $addDimTo = pvtBuilder.$rowDims;

		var cellIdxParts = cellIndex.split(':');
		var filterParts = [];
		var currentFilter = $.trim(pvtBuilder.$filter.val());

		var addQuotesIfNeeded = function (s) {
			if (typeof s !== "string")
				return s;
			if (s.indexOf(' ') >= 0 || s.indexOf(':') >= 0 || s.indexOf('=') >= 0 || s.indexOf(',') >= 0)
				return '"' + s + '"';
			return s;
		};
		var isFilterSeparator = function(ch) {
			return ch==' ' || ch==',' || ch=='+';
		};
		var hasFilterEntry = function (filter, entry) {
			var entryIdx = filter.indexOf(entry);
			if (entryIdx >= 0) {
				var nextCharIdx = entryIdx + entry.length;
				if ((entryIdx == 0 || isFilterSeparator(filter[entryIdx - 1])) && (filter.length <= nextCharIdx || isFilterSeparator(filter[nextCharIdx])))
					return true;
			}
			return false;
		}
		var composeFilter = function (dimNames, dimKeys, toDimIdx) {
			var filterEntry = '';
			var toRemove = [];
			if (toDimIdx < 0)
				toDimIdx = dimKeys.length-1;
			for (var i = 0; i <= toDimIdx; i++) {
				if (dimKeys[i] === null)
					continue;
				if (filterEntry.length > 0) {
					filterEntry += "+";
				}
				filterEntry += addQuotesIfNeeded(dimNames[i]) + "=" + addQuotesIfNeeded(dimKeys[i]);
				toRemove.push(filterEntry);
			}
			for (var i = (toRemove.length - 1); i >= 0; i--) {
				if (hasFilterEntry(currentFilter, toRemove[i])) {
					currentFilter = currentFilter.replace(toRemove[i], "");
				}
			}
			return filterEntry;
		};
		if (cellIdxParts[0].length > 0) {
			var rowIdx = parseInt(cellIdxParts[0]);
			var rowFilter = composeFilter(pvtBuilder.currentPivotData.Rows, pvtBuilder.currentPivotData.RowKeys[rowIdx],
				cellIdxParts.length > 2 ? parseInt(cellIdxParts[2]) : -1);
			if (rowFilter!=null)
				filterParts.push(rowFilter);
		} else {
			// no filter for rows, lets add new dim to columns
			$addDimTo = pvtBuilder.$columnDims;
		}
		if (cellIdxParts[1].length > 0) {
			var colIdx = parseInt(cellIdxParts[1]);
			var colFilter = composeFilter(pvtBuilder.currentPivotData.Columns, pvtBuilder.currentPivotData.ColumnKeys[colIdx],
				cellIdxParts.length > 3 ? parseInt(cellIdxParts[3]) : -1);
			if (colFilter!=null)
				filterParts.push(colFilter);
		}
		// normalize filter after duplicates removal
		currentFilter = currentFilter.replace(/([+\s]*[,][\s+]*[,]|[+\s]*[,])/gi, ",").replace(/(^[+\s]*[,][+\s]*|[,][+\s]*$|\s*[+]\s*$)/gi, "");
		currentFilter = (currentFilter.length > 0 ? currentFilter + ", " : "") + filterParts.join("+");

		if ($.trim(pvtBuilder.$filter.val()) != currentFilter || dimName) {
			this.drillDownStack.push({ CubeId: pvtBuilder.getCurrentCubeId(), Config: pvtBuilder.getPivotTableConfig() });
			this.refreshDrillUp();
		}

		pvtBuilder.$filter.val(currentFilter);
		if (dimName) {
			$addDimTo.select2('val', $addDimTo.select2("val").concat(dimName));
		}
		pvtBuilder.$el.find(pvtBuilder.options.selectors.expandCollapse).prop('checked', false);

		this.destroyLastPopover();
		pvtBuilder.render(true);
	};
	/* END: Drill-Down function */

	$.fn.pivotdataWebPivotBuilder = function (options) {
		if (typeof options == "string") {
			var instance = this.data('_pivotdataWebPivotBuilder');
			if (instance) {
				if ((typeof instance[options]) == "function") {
					return instance[options].apply(instance, Array.prototype.slice.call(arguments, 1));
				} else {
					$.error('Method ' + options + ' does not exist');
				}
			} else {
				return; // nothing to do
			}
		}
		return this.each(function () {
			var opts = $.extend(true, {}, $.fn.pivotdataWebPivotBuilder.defaults, options);
			var $holder = $(this);

			if (!$.data(this, '_pivotdataWebPivotBuilder')) {
				$.data(this, '_pivotdataWebPivotBuilder', new PivotDataWebPivotBuilder($holder, opts));
			}
		});

	};

	$.fn.pivotdataWebPivotBuilder.defaults = {
		onLoadCubes: function (callback) { }, // returns array of cubes metadata
 		onComposePivotConfig: function () { },  // use to modify pivot table configuration (add parameters etc)
 		onLoadPivotHtml: function (cubeId, pvtConfiguration, callback) { },
 		onLoadPivotJson: function (cubeId, pvtConfiguration, callback) { },
 		onPivotTableRendered: function () { },
		onPivotChartRendered: function () { },
		onCubeChanged: function (cubeInfo) { }, // called when data source is changed
 		renderOnCubeChange: true,
		allowEmptyReport: false,
		drillDown: true,
		selectors: {
			filter: ".filter",
			cubeSelect: ".cubeSelect",
			chartSelect: ".chartSelect",
			pivotChart: ".pivotChart",
			rowDims: ".rowDims",
			columnDims: ".columnDims",
			measures: ".measures",
			pivotTable: ".pivotTable",
			valueModifier: ".valueModifier",
			subtotalColumns: ".subtotalColumns",
			subtotalRows: ".subtotalRows",
			grandTotal: ".grandTotal",
			totalsColumn: ".totalsColumn",
			totalsRow: ".totalsRow",
			totalsColumnPosition: ".totalsColumnPosition",
			totalsRowPosition: ".totalsRowPosition",
			limitRows: ".limitRows",
			limitColumns: ".limitColumns",
			heatmap: ".heatmap",
			preserveGroupOrder: ".preserveGroupOrder",
			expandCollapse: ".expandCollapse",
			typeaheadAppendTo : "body" // can be null for default behaviour
		}
	};

	$.fn.pivotdataWebPivotBuilder.version = 1.0;

})(jQuery);