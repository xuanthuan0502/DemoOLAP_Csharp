//
// NReco PivotData Pivot Table Plugin
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

	function NRecoPivotTable(element, options) {
		this.element = element;
		this.options = options;

		if (options.pivotTableConfig==null)
			options.pivotTableConfig = $.extend({}, $.fn.nrecoPivotTable.defaults.pivotTableConfig);

		if (options.fixedHeaders == null) {
			options.fixedHeaders = element.css('overflow') == "auto";
		}

		init(this);
		if (options.autoload)
			this.load();
		else {
			var $tbl = element.find('table');
			if ($tbl.length == 1) {
				initTable(this, $tbl);
				initFixedHeaders(this, $tbl);
			}
		}
	}

	function onSortChanged(pvtTbl) {
		pvtTbl.element.trigger("sortChanged");
	}

	function onPageChanged(pvtTbl) {
		pvtTbl.element.trigger("pageChanged");
	}
	function onExpandCollapseChanged(pvtTbl) {
		pvtTbl.element.trigger("expandCollapseChanged");
	}

	function getDirectionStr(direction) {
		return direction == "Ascending" || direction == "0" ? "Ascending" : "Descending";
	}
	function getAxisStr(axis) {
		return axis == "Rows" || axis == "0" ? "Rows" : "Columns";
	}
	function normalizeEnums(pivotTblCfg) {
		if (pivotTblCfg.OrderKeys)
			for (var i = 0; i < pivotTblCfg.OrderKeys.length; i++) {
				var k = pivotTblCfg.OrderKeys[i];
				k.Direction = getDirectionStr(k.Direction);
				k.Axis = getAxisStr(k.Axis);
			}
		if (pivotTblCfg.SortByValue) {
			if (pivotTblCfg.SortByValue.Axis != null)
				pivotTblCfg.SortByValue.Axis = getAxisStr(pivotTblCfg.SortByValue.Axis);
			if (pivotTblCfg.SortByValue.Direction != null)
				pivotTblCfg.SortByValue.Direction = getDirectionStr(pivotTblCfg.SortByValue.Direction);
		}
	}

 	function getOrderKeysDirection(orderKeys, axis, index) {
		for (var i = 0; i < orderKeys.length; i++) {
			var k = orderKeys[i];
			if (k.Axis == axis && k.Index == index)
				return k.Direction;
		}
		return "Ascending";
	}

	function setOrderKeys(orderKeys, axis, index, direction) {
		for (var i = 0; i < orderKeys.length; i++) {
			var k = orderKeys[i];
			if ( k.Axis == axis && k.Index == index) {
				k.Direction = direction;
				return;
			}
		}
		orderKeys.push({
			Axis: axis,
			Index: index,
			Direction : direction
		});
	}

	function init(pvtTbl) {
		var o = pvtTbl.options;
		if (o.pivotTableConfig)
			normalizeEnums(o.pivotTableConfig);

		if (o.sort) {
			pvtTbl.element.on('click', o.sortColumnSelector, function () {
				var sortIdxStr = $(this).attr('data-sort-index');
				var sortIdx = null;
				if (sortIdxStr.length > 0) {
					sortIdx = parseInt(sortIdxStr);
					if (o.pivotTableConfig && o.pivotTableConfig.ColumnPage && o.pivotTableConfig.ColumnPage.Offset > 0)
						sortIdx += o.pivotTableConfig.ColumnPage.Offset;
				}
				var measureIdx = $(this).attr('data-sort-measure');
				switchSortByValue(pvtTbl, "Rows", sortIdx, measureIdx); // sort columns by row values
			});
			pvtTbl.element.on('click', o.sortRowSelector, function () {
				var sortIdxStr = $(this).attr('data-sort-index');
				var sortIdx = null;
				if (sortIdxStr.length > 0) {
					sortIdx = parseInt(sortIdxStr);
					if (o.pivotTableConfig && o.pivotTableConfig.RowPage && o.pivotTableConfig.RowPage.Offset > 0)
						sortIdx += o.pivotTableConfig.RowPage.Offset;
				}
				switchSortByValue(pvtTbl, "Columns", sortIdx); // sort columns by row values
			});

			pvtTbl.element.on('click', o.sortColumnLabelSelector, function () {
				var colDimIdx = parseInt($(this).attr('dim-sort-index'));
				var pvtTblCfg = pvtTbl.options.pivotTableConfig;
				var sort = pvtTblCfg.SortByValue ? pvtTblCfg.SortByValue : {};
				if (!pvtTblCfg.OrderKeys)
					pvtTblCfg.OrderKeys = [];

				var direction = "Ascending";
				if (sort.Axis == "Columns" && (!pvtTblCfg.PreserveGroupOrder || colDimIdx == (pvtTblCfg.Columns.length - 1) || (pvtTblCfg.PreserveGroupOrder && pvtTblCfg.SortGroupsBySubtotals) )) {
					sort.Axis = null;
					sort.Index = null;
					sort.Direction = null;
				} else {
					direction = getOrderKeysDirection(pvtTblCfg.OrderKeys, "Columns", colDimIdx) == "Descending" ? "Ascending" : "Descending";
				}
				setOrderKeys(pvtTblCfg.OrderKeys, "Columns", colDimIdx, direction);
				onSortChanged(pvtTbl);
			});

			pvtTbl.element.on('click', o.sortRowLabelSelector, function () {
				var rowDimIdx = parseInt($(this).attr('dim-sort-index'));
				var pvtTblCfg = pvtTbl.options.pivotTableConfig;
				var sort = pvtTblCfg.SortByValue ? pvtTblCfg.SortByValue : {};
				if (!pvtTblCfg.OrderKeys)
					pvtTblCfg.OrderKeys = [];

				var direction = "Ascending";
				if (sort.Axis == "Rows" && (!pvtTblCfg.PreserveGroupOrder || rowDimIdx == (pvtTblCfg.Rows.length - 1) || (pvtTblCfg.PreserveGroupOrder && pvtTblCfg.SortGroupsBySubtotals) )) {
					sort.Axis = null;
					sort.Index = null;
					sort.Direction = null;
				} else {
					direction = getOrderKeysDirection(pvtTblCfg.OrderKeys, "Rows", rowDimIdx) == "Descending" ? "Ascending" : "Descending";
				}
				setOrderKeys(pvtTblCfg.OrderKeys, "Rows", rowDimIdx, direction);
				onSortChanged(pvtTbl);
			});
		}

		if (o.pager) {
			pvtTbl.element.on('click', o.pagerSelector, function () {
				var $el = $(this);
				var $th = $el.closest('th');
				var dataOffset = $el.attr('data-offset');
				if (!dataOffset)
					dataOffset = $th.attr('data-offset');
				var newOffset = parseInt(dataOffset);
				var pvtTblCfg = pvtTbl.options.pivotTableConfig;
				if ($th.hasClass("pvtColumn")) {
					if (pvtTblCfg.ColumnPage) {
						pvtTblCfg.ColumnPage.Offset = newOffset;
						onPageChanged(pvtTbl);
					}
				} else {
					if (pvtTblCfg.RowPage) {
						pvtTblCfg.RowPage.Offset = newOffset;
						onPageChanged(pvtTbl);
					}
				}
			});
		}
		if (o.expandCollapse) {
			pvtTbl.element.removeClass("pvtExpandCollapseDisabled");
			pvtTbl.element.on('click', o.expandCollapseSelector, function () {
				var $th = $(this).closest('th');
				var grpIdxStr = $th.attr('data-grp-index');
				var grpState = $th.attr('data-grp-state');
				var pvtTblCfg = pvtTbl.options.pivotTableConfig;
				if (!pvtTblCfg.ExpandCollapse)
					pvtTblCfg.ExpandCollapse = {};
				if (grpState == "collapsed") {
					var grpIdxParts = grpIdxStr.split(":");
					for (var i = 0; i < grpIdxParts.length; i++)
						grpIdxParts[i] = parseInt(grpIdxParts[i]);
					if ($th.hasClass('pvtRow')) {
						if (!pvtTblCfg.ExpandCollapse.ExpandedRows)
							pvtTblCfg.ExpandCollapse.ExpandedRows = [];
						pvtTblCfg.ExpandCollapse.ExpandedRows.push(grpIdxParts);
					}
					if ($th.hasClass('pvtColumn')) {
						if (!pvtTblCfg.ExpandCollapse.ExpandedColumns)
							pvtTblCfg.ExpandCollapse.ExpandedColumns = [];
						pvtTblCfg.ExpandCollapse.ExpandedColumns.push(grpIdxParts);
					}
				}
				if (grpState == "expanded") {
					if ($th.hasClass('pvtRow') && pvtTblCfg.ExpandCollapse.ExpandedRows) {
						for (var i = 0; i < pvtTblCfg.ExpandCollapse.ExpandedRows.length; i++)
							if (grpIdxStr == pvtTblCfg.ExpandCollapse.ExpandedRows[i].join(":")) {
								pvtTblCfg.ExpandCollapse.ExpandedRows.splice(i, 1);
								break;
							}
					}
					if ($th.hasClass('pvtColumn') && pvtTblCfg.ExpandCollapse.ExpandedColumns) {
						for (var i = 0; i < pvtTblCfg.ExpandCollapse.ExpandedColumns.length; i++)
							if (grpIdxStr == pvtTblCfg.ExpandCollapse.ExpandedColumns[i].join(":")) {
								pvtTblCfg.ExpandCollapse.ExpandedColumns.splice(i, 1);
								break;
							}
					}
				}
				onExpandCollapseChanged(pvtTbl);
			});
		} else {
			pvtTbl.element.addClass("pvtExpandCollapseDisabled");
		}
	}

	function switchSortByValue(pvtTbl, axis, sortIdx, measureIdx) {
		var pvtTblCfg = pvtTbl.options.pivotTableConfig;
		if (!pvtTblCfg.SortByValue)
			pvtTblCfg.SortByValue = {};
		var sort = pvtTblCfg.SortByValue;
		if (sort.Axis == axis && sort.Index == sortIdx && sort.Measure == measureIdx) {
			if (sort.Direction == "Ascending") {
				sort.Direction = "Descending";
			} else {
				sort.Axis = null;
				sort.Index = null;
				sort.Direction = null;
				sort.Measure = null;
			}
		} else {
			sort.Axis = axis;
			sort.Index = sortIdx;
			sort.Direction = "Ascending";
			sort.Measure = measureIdx ? measureIdx : null;
		}
		onSortChanged(pvtTbl);
	}

	function applySortStyle(pvtTbl, $t) {
		var sort = pvtTbl.options.pivotTableConfig ? pvtTbl.options.pivotTableConfig.SortByValue : {};
		if (!sort || sort.Axis == null) return;

		var directionClass = sort.Direction=="Ascending" ? "pvtSortAsc" : "pvtSortDesc";
		var headerClassByAxis = sort.Axis == "Rows" ? "pvtColumn" : "pvtRow";
		var sortIdx = sort.Index == null ? "" : sort.Index;
		// apply pager offsets
		if (sortIdx != "") {
			if ( sort.Axis == "Rows") {
				if (pvtTbl.options.pivotTableConfig.ColumnPage && pvtTbl.options.pivotTableConfig.ColumnPage.Offset > 0)
					sortIdx -= pvtTbl.options.pivotTableConfig.ColumnPage.Offset;
			} else {
				if (pvtTbl.options.pivotTableConfig.RowPage && pvtTbl.options.pivotTableConfig.RowPage.Offset > 0)
					sortIdx -= pvtTbl.options.pivotTableConfig.RowPage.Offset;
			}
		}
		var selector = 'th.' + headerClassByAxis + '[data-sort-index="' + sortIdx + '"]';
		if (sort.Measure != null)
			selector += '[data-sort-measure="' + sort.Measure + '"]';
		$t.find(selector).addClass(directionClass);
	};

	function applyAxesLabels(pvtTbl, $t, pvtInfo) {
		var sortByValueAxis = pvtInfo.SortByValue != null ?  pvtInfo.SortByValue.Axis : null;
		var isSortDesc = function (axis, index) {
			if (pvtInfo.OrderKeys) {
				var list = pvtInfo.OrderKeys;
				for (var s = 0; s < list.length; s++)
					if ( list[s].Axis == axis && list[s].Index == index && list[s].Direction == "Descending")
						return true;
			}
			return false;
		};
		if (pvtInfo.Rows && pvtInfo.Rows.length > 0) {
			$t.find('th.pvtRowLabel').each(function (idx, th) {
				var dimSortIdx = th.getAttribute("dim-sort-index");
				var r = dimSortIdx != null ? parseInt(dimSortIdx) : idx;
				if (sortByValueAxis != "Rows" || (pvtInfo.PreserveGroupOrder && !pvtInfo.SortGroupsBySubtotals && r < (pvtInfo.Rows.length - 1))) {
					var isDesc = isSortDesc("Rows", r);
					$(th).addClass(isDesc ? "pvtSortDesc" : "pvtSortAsc");
				}
			});
		}

		if (pvtInfo.Columns && pvtInfo.Columns.length > 0) {
			$t.find('th.pvtColumnLabel').each(function (i, th) {
				var dimSortIdx = th.getAttribute("dim-sort-index");
				var r = dimSortIdx != null ? parseInt(dimSortIdx) : idx;
				if (sortByValueAxis != "Columns" || (pvtInfo.PreserveGroupOrder && !pvtInfo.SortGroupsBySubtotals && r < (pvtInfo.Columns.length - 1))) {
					var isDesc = isSortDesc("Columns", r);
					$(th).addClass(isDesc ? "pvtSortDesc" : "pvtSortAsc");
				}

			});
		}
	};

	function preparePagerContent(elem, content, page) {
		if (elem.length == 0)
			return "";
		var totalCount = parseInt(elem.attr('data-count'));
		var currentPage = Math.floor(page.Offset / page.Limit) + 1;
		var lastPage = Math.ceil(totalCount / page.Limit);
		var nextPage = Math.min(lastPage, currentPage + 1);
		var prevPage = Math.max(1, currentPage - 1);

		var pagerData = {
			firstPageOffset: 0,
			firstPage: 0,
			prevPage: prevPage,
			prevPageOffset: (prevPage - 1) * page.Limit,
			hasPrevPage: prevPage < currentPage,
			currPage: currentPage,
			nextPage: nextPage,
			nextPageOffset: (nextPage - 1) * page.Limit,
			hasNextPage: (currentPage - 1) * page.Limit < totalCount,
			lastPage : lastPage,
			lastPageOffset: (lastPage - 1) * page.Limit
		};
		if (typeof content === 'function') {
			return content(pagerData);
		} else {
			for (var token in pagerData)
				content = content.replace("{" + token + "}", pagerData[token].toString());
			return content;
		}
	};

	function mergePagerPrevNext(pvtTbl, $t) {
		var mergeCells = function($cells, attrName) {
			var res = $cells.first();
			if ($cells.length > 1) {
				var attrVal = 0;
				for (var i = 0; i < $cells.length; i++) {
					var $c = $($cells[i]);
					$c.hide();
					var v = $c.attr(attrName);
					attrVal += v ? parseInt(v) : 1;
				}
				res.show().attr(attrName, attrVal);
			}
			return res;
		};
		var colPage = pvtTbl.options.pivotTableConfig.ColumnPage;
		if (colPage) {
			var colPrev = mergeCells($t.find('th.pvtColumn[data-key-type="prev"]'), "rowspan");
			colPrev.html( preparePagerContent(colPrev, pvtTbl.options.pagerContent.columnPrev, colPage) );

			var colNext = mergeCells($t.find('th.pvtColumn[data-key-type="next"]'), "rowspan");
			colNext.html( preparePagerContent(colNext, pvtTbl.options.pagerContent.columnNext, colPage) );
		}

		var rowPage = pvtTbl.options.pivotTableConfig.RowPage;
		if (rowPage) {
			var rowPrev = mergeCells($t.find('th.pvtRow[data-key-type="prev"]'), "colspan");
			rowPrev.html( preparePagerContent(rowPrev, pvtTbl.options.pagerContent.rowPrev, rowPage) );

			var rowNext = mergeCells($t.find('th.pvtRow[data-key-type="next"]'), "colspan");
			rowNext.html( preparePagerContent(rowNext, pvtTbl.options.pagerContent.rowNext, rowPage) );
		}
	}

	var initTable = function (pvt, $tbl) {
		$tbl.addClass(pvt.options.tableClass);
		if (pvt.options.sort)
			$tbl.addClass("pvtSortHeader");
		applySortStyle(pvt, $tbl);
		if (pvt.options.pivotTableConfig) {
			applyAxesLabels(pvt, $tbl, pvt.options.pivotTableConfig);
		}
		mergePagerPrevNext(pvt, $tbl);
	};
	var initFixedHeaders = function(pvt, $tbl) {
		if (pvt.fixedHeaders)
			pvt.fixedHeaders.destroy();
		if (pvt.options.fixedHeaders) {
			pvt.fixedHeaders = new NRecoFixedHeaders(pvt.element, $tbl,
				pvt.options.fixedHeadersSmooth,
				pvt.options.fixedHeaders === true || pvt.options.fixedHeaders=="rows",
				pvt.options.fixedHeaders === true || pvt.options.fixedHeaders == "columns",
				pvt.options.fixedHeadersDisableByAreaFactor,
				pvt.options.fixedHeadersUseSticky
			);
		}
	};
	
	NRecoPivotTable.prototype.load = function () {
		var pvt = this;

		pvt.element.addClass(pvt.options.loadingClass);
		pvt.options.renderTable(pvt, function (tblHtml, pvtInfo) {
			var $tbl = $(tblHtml);
			if (pvt.options.pager && pvt.options.pivotTableConfig) {
				if (!pvtInfo.ColumnPage)
					pvtInfo.ColumnPage = pvt.options.pivotTableConfig.ColumnPage;
				if (!pvtInfo.RowPage)
					pvtInfo.RowPage = pvt.options.pivotTableConfig.RowPage;
			}
			pvt.options.pivotTableConfig = pvtInfo;
			normalizeEnums(pvt.options.pivotTableConfig);

			initTable(pvt, $tbl);
			pvt.element.html($tbl);
			initFixedHeaders(pvt, $tbl);
			
			pvt.element.removeClass(pvt.options.loadingClass);
			pvt.element.trigger("pvt.loaded");
		});
	};

	NRecoPivotTable.prototype.getPivotTableConfig = function () {
		var cfgCopy = $.extend({}, this.options.pivotTableConfig);
		if (cfgCopy.SortByValue && cfgCopy.SortByValue.Axis == null)
			cfgCopy.SortByValue = null;
		if (!this.options.pager) {
			cfgCopy.ColumnPage = null;
			cfgCopy.RowPage = null;
		}
		return cfgCopy;
	};

	NRecoPivotTable.prototype.setPivotTableConfig = function (pvtTblCfg) {
		this.options.pivotTableConfig = pvtTblCfg;
	};

	NRecoPivotTable.prototype.destroy = function () {
		if (this.fixedHeaders)
			this.fixedHeaders.destroy();
	};

	NRecoPivotTable.prototype.refreshFixedHeaders = function () {
		if (this.fixedHeaders && this.fixedHeaders.resizeHandler)
			this.fixedHeaders.resizeHandler();
	};

	// -- START: Fixed headers plugin
	function NRecoFixedHeaders($containerElem, $t, smooth, rowHdrEnabled, colHdrEnabled, disableByAreaFactor, useSticky) {
		this.$containerElem = $containerElem;
		this.$t = $t;
		this.fixedByTop = [];
		this.fixedByLeft = [];
		this.smooth = smooth;
		this.rowHdrEnabled = rowHdrEnabled;
		this.colHdrEnabled = colHdrEnabled;

		this.useSticky = useSticky;
		if (typeof useSticky !== "boolean") {
			// test for sticky support
			var testDiv = document.createElement('div');
			testDiv.style.position = 'sticky';
			this.useSticky = testDiv.style.position.indexOf('sticky') >= 0;
		}
		
		if (disableByAreaFactor) {
			var containerWidth = this.$containerElem.width();
			var rowLabelsWidth = 0;
			this.$t.find('th.pvtRowLabel,th.pvtColumnLabel:first').each(function() { rowLabelsWidth += this.clientWidth; });
			if ( (disableByAreaFactor*containerWidth)<rowLabelsWidth )
				this.rowHdrEnabled = false;
			
			var containerHeight = this.$containerElem.height();
			var colLabelsHeight = 0;
			this.$t.find('th.pvtColumnLabel').each(function() { colLabelsHeight += this.clientHeight; });
			if ( (disableByAreaFactor*containerHeight)<colLabelsHeight )
				this.colHdrEnabled = false;
		}

		this.init();
	}
	NRecoFixedHeaders.prototype.buildFixedHeaders = function (syncUpdate) {
		var $scrollDiv = this.$containerElem;

		var $t = this.$t;
		var fixedHeaders = [];
		var fixedByTop = this.fixedByTop = [];
		var fixedByLeft = this.fixedByLeft = [];
		var rowHdrEnabled = this.rowHdrEnabled;
		var colHdrEnabled = this.colHdrEnabled;

		$scrollDiv.addClass("pvtFixedHeaderOuterContainer");
		$t.addClass('pvtFixedHeader');
		var colTotalsTH = $t.find('th.totals.pvtColumn');
		if (colTotalsTH.length > 0) {
			$t.addClass("pvtHasTotalsLastColumn");
		}
		var thNodes = $t[0].getElementsByTagName('TH');
		for (var i = 0; i < thNodes.length; i++) {
			var th = thNodes[i];

			var isColumnDimLabel = th.className.indexOf('pvtColumnLabel') >= 0;
			var isRowDimLabel = th.className.indexOf('pvtRowLabel') >= 0;
			var isPvtColumn = !isColumnDimLabel && th.className.indexOf('pvtColumn') >= 0;
			var isPvtRow = !isRowDimLabel && th.className.indexOf('pvtRow') >= 0;

			var entry = {
				th: th,
				isCol: isPvtColumn,
				isRow: isPvtRow
			};
			if (!isPvtColumn)
				entry.fixedLeft = true;
			if (!isPvtRow) {
				entry.fixedTop = true;
			}

			var wrapDiv = null;
			if (th.childNodes.length == 1 && th.childNodes[0].tagName == "DIV") {
				wrapDiv = th.childNodes[0];
				wrapDiv.className = "pvtFixedHeader";
			} else {
				wrapDiv = document.createElement('div');
				wrapDiv.className = 'pvtFixedHeader';
				if (entry.isCol || entry.isRow)
					wrapDiv.setAttribute('title', th.textContent);
				if (th.childNodes.length > 0) {
					while (th.childNodes.length > 0)
						wrapDiv.appendChild(th.childNodes[0]);
				} else {
					wrapDiv.textContent = th.textContent;
				}
				th.appendChild(wrapDiv);
			}
			entry.el = wrapDiv;

			fixedHeaders.push(entry);
		}

		function getElementRectLegacy(el) {
			return { height: el.clientHeight, top: el.offsetTop, left: el.offsetLeft };
		}
		function getElementRectWithGetBounding(el) {
			var rect = el.getBoundingClientRect();
			return { height: rect.height, top: rect.top, left: rect.left };
		}
		var getElementRect = $scrollDiv[0].getBoundingClientRect ? getElementRectWithGetBounding : getElementRectLegacy;
		if (this.useSticky) {
			var tblRect = getElementRect($t[0]);
			for (var i = fixedHeaders.length-1; i >=0; i--) {
				var entry = fixedHeaders[i];
				var thRect = getElementRect(entry.th);
				entry.offsetTop = thRect.top - tblRect.top;
				entry.offsetLeft = thRect.left - tblRect.left;
				entry.height = thRect.height;
			}
			var setFixedHeaderHeightTopLeft = function () {
				for (var i = 0; i < fixedHeaders.length; i++) {
					var entry = fixedHeaders[i];
					entry.el.style.height = entry.height + "px";
					if (colHdrEnabled && entry.fixedTop) {
						entry.th.style.top = entry.offsetTop + "px";
					}
					if (rowHdrEnabled && entry.fixedLeft) {
						entry.th.style.left = entry.offsetLeft + "px";
					}
				}
				$scrollDiv.addClass('pvtStickyFixedHeader');
			};
			if (window.requestAnimationFrame && !syncUpdate)
				window.requestAnimationFrame(setFixedHeaderHeightTopLeft);
			else
				setFixedHeaderHeightTopLeft();
		} else {
			// fallback that moves headers on scroll
			for (var i = fixedHeaders.length - 1; i >= 0; i--) {
				var entry = fixedHeaders[i];
				var thRect = getElementRect(entry.th);
				entry.height = thRect.height;
				if (colHdrEnabled && entry.fixedTop) {
					fixedByTop.push({
						el: entry.el,
						th: entry.th,
						top: 0,
						lastTop: 0
					});
				}
				if (rowHdrEnabled && entry.fixedLeft) {
					fixedByLeft.push({
						el: entry.el,
						th: entry.th,
						left: 0,
						lastLeft: 0,
					});
				}
			}
			var setFixedHeaderHeight = function () {
				for (var i = 0; i < fixedHeaders.length; i++) {
					var entry = fixedHeaders[i];
					entry.el.style.height = entry.height + "px";
				}
			};
			if (window.requestAnimationFrame && !syncUpdate)
				window.requestAnimationFrame(setFixedHeaderHeight);
			else
				setFixedHeaderHeight();
		}

	};
	NRecoFixedHeaders.prototype.refreshHeaders = function (top, left) {
		var fixedByLeft = this.fixedByLeft;
		var fixedByTop = this.fixedByTop;
		var setLeftTop = function () {
			var newPos;
			var entry;
			for (var i = 0; i < fixedByLeft.length; i++) {
				entry = fixedByLeft[i];
				newPos = (left + entry.left);
				if (newPos != entry.lastLeft) {
					entry.lastLeft = newPos;
					entry.el.style.left = newPos + "px";
				}
			}
			for (var i = 0; i < fixedByTop.length; i++) {
				entry = fixedByTop[i];
				newPos = (top + entry.top);
				if (newPos != entry.lastTop) {
					entry.lastTop = newPos;
					entry.el.style.top = newPos + "px";
				}
			}
		};
		if (window.requestAnimationFrame)
			window.requestAnimationFrame(setLeftTop);
		else
			setLeftTop();
	};

	NRecoFixedHeaders.prototype.destroy = function () {
		this.$containerElem.off("scroll wheel");
		if (this.resizeHandler)
			$(window).off('resize', this.resizeHandler);
		this.fixedByTop = null;
		this.fixedByLeft = null;
		this.$containerElem = null;
		this.$t = null;
	};


	NRecoFixedHeaders.prototype.init = function () {
		this.buildFixedHeaders();
		var instance = this;

		if (!this.useSticky) {
			// emulate position sticky by handling scroll event
			var scrollElem = this.$containerElem[0];
			var timeout = null;
			var prevTop = -1;
			var prevLeft = -1;
			var refreshHandler = this.smooth ?
				instance.refreshHeaders :
				function (top, left) {
					if (timeout)
						clearTimeout(timeout);
					this.$containerElem.addClass("pvtFixedHeadersOutdated");
					timeout = setTimeout(function () {
						timeout = null;
						instance.$containerElem.removeClass("pvtFixedHeadersOutdated");
						instance.refreshHeaders(top, left);
					}, 300);
				};
			this.$containerElem.on("scroll", function (evt) {
				var top = scrollElem.scrollTop;
				var left = scrollElem.scrollLeft;
				if (top != prevTop || left != prevLeft) {
					prevTop = top;
					prevLeft = left;
					refreshHandler.call(instance, top, left);
				}
			});
			this.$containerElem.scroll();
		}

		// resize handling
		var containerWidth = this.$containerElem[0].clientWidth;
		this.resizeHandler = function () {
			var newWidth = instance.$containerElem[0].clientWidth;
			if (containerWidth == newWidth) {
				return; // nothing is changed
			}
			containerWidth = newWidth;
			var refreshFixedHeaders = function () {
				instance.$t.find('div.pvtFixedHeader').each(function () {
					this.style.height = 'auto';
					if (!instance.useSticky) {
						this.style.top = '0px';
						this.style.left = '0px';
					}
				});
				instance.$containerElem.removeClass("pvtStickyFixedHeader");
				instance.buildFixedHeaders(true);
				if (!instance.useSticky) {
					instance.refreshHeaders(instance.$containerElem[0].scrollTop, instance.$containerElem[0].scrollLeft);
				}
			};
			if (window.requestAnimationFrame)
				window.requestAnimationFrame(refreshFixedHeaders);
			else
				refreshFixedHeaders();
		};
		$(window).on('resize', this.resizeHandler);
	};
	// -- END: Fixed headers plugin 

	$.fn.nrecoPivotTable = function (options) {
		if (typeof options == "string") {
			var instance = this.data('_nrecoPivotTable');
			if (instance && (typeof instance[options]) == "function") {
				return instance[options].apply(instance, Array.prototype.slice.call(arguments, 1));
			} else {
				$.error('Method ' + options + ' does not exist');
			}
		}
		return this.each(function () {
			var opts = $.extend({}, $.fn.nrecoPivotTable.defaults, options);
			var $holder = $(this);

			if (!$.data(this, '_nrecoPivotTable')) {
				$.data(this, '_nrecoPivotTable', new NRecoPivotTable($holder, opts));
			}
		});

	};

	$.fn.nrecoPivotTable.defaults = {
		renderTable: function (settings, callback) { alert('renderTable is not defined!'); },
		sort: true, 
		sortColumnSelector: 'th.pvtColumn[data-sort-index]',
		sortRowSelector: 'th.pvtRow[data-sort-index]',
		tableClass: 'table pvtTable',
		sortColumnLabelSelector: 'th.pvtColumnLabel',
		sortRowLabelSelector: 'th.pvtRowLabel',
		pagerSelector: 'th .pvtPager',
		expandCollapseSelector: 'th[data-grp-state]',
		loadingClass: "pvtLoading",
		autoload: false,
		fixedHeaders: null,  // true/false/"columns"/"rows" or null = autodetect by overflow:auto
		fixedHeadersSmooth: false,
		fixedHeadersUseSticky : null, // true/false or null to use if browser supports position:sticky
		fixedHeadersDisableByAreaFactor: null,  // disables fixed headers for rows (columns) if width (height) of axis headers greater than container width (height) * factor
		pager : true,
		expandCollapse : true,
		pagerContent : {
			columnPrev: '<span class="pvtPager glyphicon glyphicon-chevron-left" title="Previous ({prevPage}/{lastPage})"></span>', // or function(pagerData) that returns content
			columnNext: '<span class="pvtPager glyphicon glyphicon-chevron-right" title="Next ({nextPage}/{lastPage})"></span>',
			rowPrev: '<span class="pvtPager glyphicon glyphicon-chevron-up" title="Previous ({prevPage}/{lastPage})"></span>',
			rowNext: '<span class="pvtPager glyphicon glyphicon-chevron-down" title="Next ({nextPage}/{lastPage})"></span>'
		},
		pivotTableConfig: {
			SortByValue: {},
			OrderKeys: [],
			ColumnPage: null,  // example: { Offset: 0, Limit : 10 }
			RowPage : null
		}
	};

	$.fn.nrecoPivotTable.version = 1.4;

})(jQuery);