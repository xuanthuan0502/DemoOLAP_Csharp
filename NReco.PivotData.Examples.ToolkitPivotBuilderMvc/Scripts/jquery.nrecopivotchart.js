//
// NReco PivotData Pivot Chart Plugin (renders pivot data with Chartist.js)
// @version 1.0
// @author Vitaliy Fedorchenko
// 
// Copyright (c) Vitaliy Fedorchenko (nrecosite.com) - All Rights Reserved
// THIS CODE AND INFORMATION ARE PROVIDED "AS IS" WITHOUT WARRANTY OF ANY 
// KIND, EITHER EXPRESSED OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND/OR FITNESS FOR A
// PARTICULAR PURPOSE.
//

(function ($) {

	function NRecoPivotChart(element, options) {
		this.element = element;
		this.options = options;

		init(this);
	}

	function init(pvtChart) {
		var o = pvtChart.options;

		if ((typeof pvtChart[o.chartType]) == "function") {
			var legendEnabled = o.legend && o.legend.enabled;
			if (legendEnabled) {
				var legendPosition = o.legend.position ? o.legend.position : "bottom";
				var $el = $(pvtChart.element);
				$el.addClass("ct-legend-"+legendPosition);
			}
			
			pvtChart[o.chartType].apply(pvtChart, []);
			
			if (legendEnabled) {
				renderLegend.bind(pvtChart)(pvtChart.chart, legendPosition, o.chartType);
			}
		} else {
			$.error('Unknown chart type: ' + o.chartType);
		}
	}

	function renderLegend(chart, position, chartType) {
		var legendElement = document.createElement('ul');
		legendElement.className = 'ct-legend';
		var chartWidth = chart.options.width ? chart.options.width : $(chart.container).width();
		if (chartWidth && (position=="top" || position=="bottom")) {
			legendElement.style.cssText = 'width: ' + chartWidth + 'px;margin-left:auto;margin-right:auto;';
		}
		for (var i=0; i<chart.data.series.length; i++) {
			var s = chart.data.series[i];
			var seriesLabel = s.meta ? s.meta : s.name;
			var labelElement = document.createElement('li');
			var colorSpanElement = document.createElement('span');
			colorSpanElement.className = this.options.legend.classNamePrefix+Chartist.alphaNumerate(i);
			var textSpanElement = document.createElement('span');
			textSpanElement.textContent = seriesLabel;
			labelElement.appendChild(colorSpanElement);
			labelElement.appendChild(textSpanElement);
			if (seriesLabel!=null)
				legendElement.appendChild(labelElement);
		}
		chart.container.insertBefore(legendElement, null);
		// check for compact mode
		var chartHeight = chart.options.height ? chart.options.height : $(chart.container).height();
		var liElems = legendElement.childNodes;
		var liTotalWidth = 0;
		var liTotalHeight = 0;
		for (var i=0; i<liElems.length; i++) {
			var $li = $(liElems[i]);
			liTotalWidth += $li.width();
			liTotalHeight += $li.height();
		}
		if ( ((position=="top" || position=="bottom") && chartWidth && liTotalWidth>chartWidth)
			 ||
			 (position=="right" && chartHeight && liTotalHeight>chartHeight) ) {
			legendElement.className += " ct-legend-compact";
		}
	}
	
	function ifnull(o, nullValue) {
		if (o instanceof Array) {
			var arr = [];
			for (var i = 0; i < o.length; i++)
				arr.push(ifnull(o[i], nullValue));
			return arr;
		}
		return o != null ? o : nullValue;
	}

	function onCreated(pvtChart) {
		if (pvtChart.chart && typeof pvtChart.options.created == "function") {
			pvtChart.chart.on('created', pvtChart.options.created);
		}
	}

	function valOrFirstElem(o) {
		if (o instanceof Array)
			return o[0];
		return o;
	}

	NRecoPivotChart.prototype.getChartData = function (totalsOnly) {
		var pivotData = this.options.pivotData;

		var chartData = { labels: [], series: [], onlyInteger : true, nonZeroNumsCount : 0 };
		var addLabels = function (dimKeys, dims) {
			for (var i = 0; i < dimKeys.length; i++)
				chartData.labels.push(dimKeys[i].join(" "));
			if (dims)
				chartData.axisLabel = dims.join(", ");
		};
		var numberIsInteger = Number.isInteger || function(value) {
		  return typeof value === 'number' && 
			isFinite(value) && 
			Math.floor(value) === value;
		};		
		var checkForInteger = function(numVal) {
			if (numVal!=null) {
				if (!numberIsInteger(numVal)) {
					chartData.onlyInteger = false;
				}
				if (typeof numVal === 'number' && numVal!==0)
					chartData.nonZeroNumsCount++;
			}
			return numVal;
		};
		var getMeasureValuesArray = function(values) {
			var res = [];
			for (var i = 0; i < values.length; i++)
				res.push(checkForInteger(ifnull(valOrFirstElem(values[i]), 0)));
			return res;
		};	
		
		if (pivotData.MeasureLabels.length>1) {
			// handle multiple measures in a special way
			if (pivotData.RowKeys.length > 0 && !totalsOnly) {
				addLabels(pivotData.RowKeys, pivotData.Rows);
				for (var i = 0; i < pivotData.MeasureLabels.length; i++) {
					var seriesData = [];
					for (var j = 0; j < pivotData.RowTotals.length; j++) {
						seriesData.push(checkForInteger(ifnull(pivotData.RowTotals[j][i], 0)));
					}
					seriesData.name = pivotData.MeasureLabels[i];
					chartData.series.push(seriesData);
				}
			} else if (pivotData.ColumnKeys.length > 0 && !totalsOnly) {
				addLabels(pivotData.ColumnKeys, pivotData.Columns);
				for (var i = 0; i < pivotData.MeasureLabels.length; i++) {
					var seriesData = [];
					for (var j = 0; j < pivotData.ColumnTotals.length; j++) {
						seriesData.push(checkForInteger(ifnull(pivotData.ColumnTotals[j][i], 0)));
					}
					seriesData.name = pivotData.MeasureLabels[i];
					chartData.series.push(seriesData);
				}
			} else {
				chartData.labels = pivotData.MeasureLabels;
				chartData.series.push(pivotData.GrandTotal);
				for (var i=0; i<pivotData.GrandTotal.length; i++)
					checkForInteger(pivotData.GrandTotal[i]);
			}
			return chartData;
		}

		if (pivotData.RowKeys.length > 0 && pivotData.ColumnKeys.length > 0 && !totalsOnly) {
			if (pivotData.ColumnKeys.length > 0) {
				addLabels(pivotData.ColumnKeys, pivotData.Columns);
			} else {
				addLabels(pivotData.RowKeys, pivotData.Rows);
			}
			for (var r = 0; r < pivotData.Values.length; r++) {
				var row = pivotData.Values[r];
				var rowData = getMeasureValuesArray(row);
				rowData.name = pivotData.RowKeys[r].join(" ");
				chartData.series.push( rowData );
			}
		} else {
			if (pivotData.RowTotals.length > 0) {
				addLabels(pivotData.RowKeys, pivotData.Rows);
				chartData.series.push(getMeasureValuesArray(pivotData.RowTotals));
			} else if (pivotData.ColumnTotals.length > 0) {
				addLabels(pivotData.ColumnKeys, pivotData.Columns);
				chartData.series.push(getMeasureValuesArray(pivotData.ColumnTotals));
			} else {
				chartData.labels = ["Grand Total"];
				chartData.series.push([checkForInteger(ifnull(pivotData.GrandTotal, 0))])
			}
		}
		return chartData;
	};

	var onInitAxesLabels = function (pvtChart, chartOpts, chartData, flip) {
		if (typeof pvtChart.options.initAxesLabels == "function") {
			var numAxisLabel = pvtChart.options.pivotData.MeasureLabels.join(", ");
			var dimAxisLabel = chartData.axisLabel;
			pvtChart.options.initAxesLabels({
				axisXLabel: flip ? numAxisLabel : dimAxisLabel,
				axisYLabel: flip ? dimAxisLabel : numAxisLabel,
				chartOptions : chartOpts
			});
		}
	};
	
	var setAxesOnlyInteger = function(chartOpts, chartData) {
		if (chartData.onlyInteger) {
			if (!chartOpts.axisX) chartOpts.axisX = {};
			if (!chartOpts.axisX.hasOwnProperty("onlyInteger"))
				chartOpts.axisX.onlyInteger = true;
			if (!chartOpts.axisY) chartOpts.axisY = {};
			if (!chartOpts.axisY.hasOwnProperty("onlyInteger"))
				chartOpts.axisY.onlyInteger = true;
		}
	};
	var setMaxLabelsX = function(pvtChart, chartOpts, chartData) {
		var axisOpts = chartOpts["axisX"];
		if (!axisOpts || !axisOpts.maxLabels || chartData.labels.length==0)
			return;
		if (axisOpts.maxLabels>=chartData.labels.length)
			return;
		var _labelInterpolationFnc = axisOpts.labelInterpolationFnc;
		var _onDraw = chartOpts.onDraw;
		var skipFactor = Math.ceil( 1.0/( axisOpts.maxLabels/chartData.labels.length) );
		if (skipFactor>1) {
			axisOpts.labelInterpolationFnc = function(value, index) {
				if (_labelInterpolationFnc)
					value = _labelInterpolationFnc(value,index);
				return index % skipFactor  === 0 ? value : null;
			};
			// expand width
			chartOpts.onDraw = function(data) {
				if (_onDraw)
					_onDraw(data);
				if (data.type==='label' && data.axis.units.pos==="x") {
					var labelEl = data.element.querySelector('span');
					if (labelEl==null)
						labelEl = data.element;
					labelEl.attr({
						style: 'width: ' + Math.floor(data.width*skipFactor*0.9) + 'px'
					});
				}
			};
		}
	};
	var onDrawHandleLabelOverflow = function(data,chartOpts) {
		if (data.type==='label') {
			var labelEl = data.element.querySelector('span');
			if (labelEl==null)
				labelEl = data.element;
			var isOverflowX = labelEl._node.scrollWidth > labelEl._node.clientWidth;
			var isOverflowY = labelEl._node.scrollHeight > labelEl._node.clientHeight;
			if (isOverflowX || isOverflowY) {
				labelEl.attr({title: data.text});
				labelEl.addClass("ct-overflow");
				if (isOverflowY)
					labelEl.addClass("ct-overflow-y");
				if (isOverflowX)
					labelEl.addClass("ct-overflow-x");
			}
		}
	};
	
	var createBarInternal = function (pvtChart, stacked, horizontal, getWidth) {
		var pivotData = pvtChart.options.pivotData;
		var chartData = pvtChart.getChartData();
		var barsInSeries = (chartData.series.length > 0 ? chartData.series[0].length : 0);
		var barsCount = Math.max(1, stacked ? barsInSeries : chartData.series.length * barsInSeries);

		var chartOpts = $.extend(true, {}, pvtChart.options.chartOptions);
		setAxesOnlyInteger(chartOpts,chartData);
		chartOpts.seriesBarDistance = 15;
		chartOpts.stackBars = stacked;
		if (horizontal) {
			chartOpts.reverseData = true;
			// reverseData affects both series and values in series, but didn't affect names
			// lets keep series in original order + fix names in series
			var seriesNames = $.map(chartData.series, function (s) { return s.name; });
			seriesNames.reverse();
			$.each(seriesNames, function (i, name) { chartData.series[i].name = name; });
			chartData.series.reverse();

			chartOpts.horizontalBars = true;
		}
		onInitAxesLabels(pvtChart, chartOpts, chartData, horizontal);
		if (horizontal && chartOpts.axisY) {
			if (chartOpts.axisY.minLabelHeight) {
				var _onDraw = chartOpts.onDraw;
				chartOpts.onDraw = function(data) {
					if (data.type==='label' && data.axis.units.pos==="y") {
						if (data.height<chartOpts.axisY.minLabelHeight) {
							data.element.attr({style: 'display: none'});
						}
					}
					if (_onDraw)
						_onDraw(data);
				};
			}
		}
		var animationEnabled = pvtChart.options.animation>0 && chartData.nonZeroNumsCount<=pvtChart.options.animationThreshold;
		pvtChart.chart = new Chartist.Bar('#' + pvtChart.element.attr('id'), chartData, chartOpts, {});
		pvtChart.chart.on('draw', function (data) {
			if (data.type === 'bar') {
				var chartWidth = getWidth(data)*0.7;
				var barWidth = Math.min(chartWidth/5,Math.max(3, Math.round(chartWidth / barsCount)));
				if (pvtChart.options.animation && animationEnabled) {
					data.element.attr({style: 'stroke-width: 0px'});
					var animateOpts = {
						'stroke-width': {
							begin: 0,
							dur:   1,
							from:  0,
							to:    barWidth,
							fill:  'freeze'
						}
					};
					if (horizontal) {
						animateOpts['x2'] = {
							begin:  0,
							dur:    pvtChart.options.animation,
							from:   data.chartRect.x1,
							to:     data.x2,
							easing: Chartist.Svg.Easing.easeOutCubic,
							fill:  'freeze'
						};
						if (stacked) {
							animateOpts['x1'] = {
								begin:  0,
								dur:    pvtChart.options.animation,
								from:   data.chartRect.x1,
								to:     data.x1,
								easing: Chartist.Svg.Easing.easeOutCubic,
								fill:  'freeze'
							};
						}
					} else {
						animateOpts['y2'] = {
							begin:  0,
							dur:    pvtChart.options.animation,
							from:   data.chartRect.y1,
							to:     data.y2,
							easing: Chartist.Svg.Easing.easeOutCubic,
							fill:  'freeze'
						};
						if (stacked) {
							animateOpts['y1'] = {
								begin:  0,
								dur:    pvtChart.options.animation,
								from:   data.chartRect.y1,
								to:     data.y1,
								easing: Chartist.Svg.Easing.easeOutCubic,
								fill:  'freeze'
							};
						}
					}
					data.element.animate(animateOpts, false);
				} else {
					data.element.attr({ style: 'stroke-width: ' + barWidth + 'px'});
				}
				
			}
			onDrawHandleLabelOverflow(data, chartOpts);
			if (chartOpts.onDraw)
				chartOpts.onDraw(data);
		});
		// lets use 'data' event to intercept 'getCurrentOptions' for correct seriesBarDistrance calculation on resize
		pvtChart.chart.on('data', function () {
			var origGetCurrentOptions = pvtChart.chart.optionsProvider.getCurrentOptions;
			pvtChart.chart.optionsProvider.getCurrentOptions = function () {
				var opts = origGetCurrentOptions();
				var width = getWidth(null, opts)*0.75;
				opts.seriesBarDistance = Math.max(3, Math.min(width/5,Math.round(width / barsCount)) );
				return opts;
			};
		});
		onCreated(pvtChart);
	};

	var getChartWidth = function (data, opts) {
		if (!data) {
			var w = this.element.width();
			if (opts && opts.axisX && opts.axisX.offset)
				w -= opts.axisX.offset;
			if (opts && opts.chartPadding) {
				w -= (opts.chartPadding.left + opts.chartPadding.right);
			}
			return w;
		}
		return data.chartRect.width();
	};
	var getChartHeight = function (data, opts) {
		if (!data) {
			var h = this.element.height();
			if (opts && opts.axisY && opts.axisY.offset)
				h -= opts.axisY.offset;
			if (opts && opts.chartPadding) {
				h -= (opts.chartPadding.top + opts.chartPadding.bottom);
			}
			return h;
		}
		return data.chartRect.height();
	};

	NRecoPivotChart.prototype.bar = function (stacked) {
		createBarInternal(this, false, false, getChartWidth.bind(this) );
	};

	NRecoPivotChart.prototype.stackedBar = function () {
		createBarInternal(this, true, false, getChartWidth.bind(this) );
	};

	NRecoPivotChart.prototype.horizontalBar = function (stacked) {
		createBarInternal(this, false, true, getChartHeight.bind(this) );
	};


	NRecoPivotChart.prototype.horizontalStackedBar = function () {
		createBarInternal(this, true, true, getChartHeight.bind(this) );
	};

	NRecoPivotChart.prototype.pie = function (extraPieOpts) {
		var pivotData = this.options.pivotData;
		var pvtChart = this;
		var chartData = this.getChartData(true);

		var chartOpts = $.extend({}, this.options.chartOptions, extraPieOpts);

		var totalSum = chartData.series[0].reduce(function (a, b) { return a + b });

		chartOpts.labelInterpolationFnc = function (value) {
			var percent = Math.round(value / totalSum * 100);
			return percent>1 ? percent+'%' : '';
		};
		var pieChartSeries = [];
		for (var i = 0; i < chartData.series[0].length; i++) {
			var d = { value: chartData.series[0][i] };
			if (chartData.labels && i<chartData.labels.length)
				d.meta = chartData.labels[i];
			pieChartSeries.push(d);
		}
		var animationStepDuration = pvtChart.options.animation/pieChartSeries.length/2;
		var animationEnabled = pvtChart.options.animation>0 && pieChartSeries.length<=pvtChart.options.animationThreshold;		
		this.chart = new Chartist.Pie('#' + this.element.attr('id'),
			{
				series: pieChartSeries
			}, chartOpts, {});
		this.chart.on('draw', function (data) {
			if (pvtChart.options.animation && animationEnabled) {
				if (data.type === 'slice') {
					data.element.animate({
						opacity: {
							begin: data.index*animationStepDuration,
							dur: pvtChart.options.animation/2,
							from: 0,
							to: 1,
							easing: 'easeOutQuart'
						}					
					});
				}
			}
			if (chartOpts.onDraw)
				chartOpts.onDraw(data);
		});			
		onCreated(this);
	};

	NRecoPivotChart.prototype.donut = function () {
		var pieOpts = {
			donut: true,
			showLabel: true			
		};
		if (this.options.chartOptions && !this.options.chartOptions.donutWidth)
			pieOpts.donutWidth = 60;
		this.pie(pieOpts);
	};
	
	var applyLineAreaAnimation = function(chartElem, data, duration, animateLines) {
		if (animateLines && (data.type === 'line' || data.type === 'area')) {
			$(chartElem).addClass('ct-animation');
			var emitter = Chartist.EventEmitter();
			emitter.addEventHandler('animationEnd', function(e) {
				$(chartElem).removeClass('ct-animation');
			});
			data.element.animate({
				d: {
					begin: 0,
					dur: duration,
					from: data.path.clone().scale(1, 0).translate(0, data.chartRect.height()).stringify(),
					to: data.path.clone().stringify(),
					easing: Chartist.Svg.Easing.easeOutQuint
				}
			}, true, emitter);
		}
	};
	var isAnimationEnabledForLineChart = function(pvtChart, chartData, chartOpts) {
		var dataPointsCount = 0;
		for (var i=0; i<chartData.series.length; i++) {
			dataPointsCount += chartData.series[i].length;
		}
		return dataPointsCount<=(chartOpts.showLine ? pvtChart.options.animationLineThreshold : pvtChart.options.animationThreshold);
	};
	var checkForCondensed = function(pvtChart, chartData) {
		var maxPointsInLine = 0;
		for (var i=0; i<chartData.series.length; i++) {
			var seriesLen = chartData.series[i].length;
			if (seriesLen>maxPointsInLine)
				maxPointsInLine = seriesLen;
		}
		var elWidth = pvtChart.element.width();
		if (elWidth && maxPointsInLine) {
			var dotsDensity = elWidth/maxPointsInLine;
			if (dotsDensity<10) {
				$(pvtChart.element).addClass("ct-condensed");
			}
		}
	};
	
	NRecoPivotChart.prototype.line = function () {
		this.scatterplot(true);
	};

	NRecoPivotChart.prototype.scatterplot = function (drawLines) {
		var pivotData = this.options.pivotData;
		var pvtChart = this;
		
		var chartData = this.getChartData();
		
		var chartOpts = $.extend(true, {}, this.options.chartOptions);
		setAxesOnlyInteger(chartOpts, chartData);
		chartOpts.showLine = drawLines ? true : false;
		chartOpts.fullWidth = true;
		chartOpts.lineSmooth = false;
		onInitAxesLabels(this, chartOpts, chartData, false);
		setMaxLabelsX(this, chartOpts, chartData);
		checkForCondensed(pvtChart, chartData);
		
		var animationEnabled = pvtChart.options.animation && isAnimationEnabledForLineChart(pvtChart, chartData, chartOpts);
		this.chart = new Chartist.Line('#' + this.element.attr('id'), chartData, chartOpts);
		this.chart.on('draw', function (data) {
			if(animationEnabled && pvtChart.options.animation) {
				applyLineAreaAnimation(pvtChart.element, data, pvtChart.options.animation, drawLines);
			}
			if (chartOpts.onDraw)
				chartOpts.onDraw(data);
			onDrawHandleLabelOverflow(data, chartOpts);
		});
		onCreated(this);
	};

	NRecoPivotChart.prototype.stackedArea = function () {
		var pivotData = this.options.pivotData;
		var pvtChart = this;

		var chartData = this.getChartData();
		// lets calculate as running total to get "stacked" area chart
		for (var i = chartData.series.length - 1; i > 0; i--) {
			var currSeries = chartData.series[i];
			var nextSeries = chartData.series[i - 1];
			for (var j = 0; j < nextSeries.length; j++) {
				if (currSeries[j])
					nextSeries[j] = (nextSeries[j] ? nextSeries[j] : 0) + currSeries[j];
			}
		}	

		var chartOpts = $.extend(true, {}, this.options.chartOptions);
		setAxesOnlyInteger(chartOpts, chartData);
		chartOpts.showLine = true;
		chartOpts.showArea = true;
		chartOpts.fullWidth = true;
		chartOpts.lineSmooth = false;
		onInitAxesLabels(this, chartOpts, chartData, false);
		setMaxLabelsX(this, chartOpts, chartData);
		checkForCondensed(pvtChart, chartData);

		var animationEnabled = pvtChart.options.animation && isAnimationEnabledForLineChart(pvtChart, chartData, chartOpts);
		
		this.chart = new Chartist.Line('#' + this.element.attr('id'), chartData, chartOpts);
		this.chart.on('draw', function (data) {
			if (data.type === 'point') {
				data.element.attr({'ct:value':""});
			}
			if (animationEnabled && pvtChart.options.animation) {
				applyLineAreaAnimation(pvtChart.element, data, pvtChart.options.animation, true);
			}
			
			onDrawHandleLabelOverflow(data, chartOpts);
			if (chartOpts.onDraw)
				chartOpts.onDraw(data);	
		});
		onCreated(this);
	};

	NRecoPivotChart.prototype.destroy = function () {
		if (this.chart) {
			this.chart.detach();
			this.chart = null;
		}
	};
	
	NRecoPivotChart.prototype.setOptions = function(newOpts) {
		this.options = $.extend(this.options, newOpts);
	};

	$.fn.nrecoPivotChart = function (options) {
		if (typeof options == "string") {
			var instance = this.data('_nrecoPivotChart');
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
			var opts = $.extend({}, $.fn.nrecoPivotChart.defaults, options);
			var $holder = $(this);

			if (!$.data(this, '_nrecoPivotChart')) {
				$.data(this, '_nrecoPivotChart', new NRecoPivotChart($holder, opts));
			}
		});

	};

	$.fn.nrecoPivotChart.defaults = {
		pivotData: {},
		chartOptions: {},
		created: null,
		initAxesLabels : null,
		legend : {
			enabled : 0,
			classNamePrefix : "",
			position:"bottom"
		},
		animation:0,
		animationThreshold:300,
		animationLineThreshold:3000,
		chartType: "bar"  // line, scatterplot, stackedArea, bar, stackedBar, horizontalBar, horizontalStackedBar, pie, donut
	};

	$.fn.nrecoPivotChart.version = 1.0;

})(jQuery);