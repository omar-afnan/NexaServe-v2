import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../components/sideBar';
import './CSS/SupporterReports.css';

// React Icons
import {
  MdBarChart,
  MdTrendingUp,
  MdCalendarToday,
  MdDownload,
  MdPieChart,
  MdShowChart,
  MdAssessment
} from "react-icons/md";

import {
  IoStatsChart,
  IoTimeOutline,
  IoCheckmarkDone
} from "react-icons/io5";

import {
  HiChartBar,
  HiDocumentReport
} from "react-icons/hi";

function SupporterReports() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState("all");
  const [reportType, setReportType] = useState("overview");

  const [lineTooltip, setLineTooltip] = useState({
    show: false, x: 0, y: 0, day: '', date: '', count: 0
  });

  const [pieTooltip, setPieTooltip] = useState({
    show: false, status: '', count: 0, percentage: ''
  });

  const [donutTooltip, setDonutTooltip] = useState({
    show: false, category: '', count: 0, percentage: ''
  });

  // line chart needs unfiltered data regardless of date range
  const [allTickets, setAllTickets] = useState([]);

  const [stats, setStats] = useState({
    totalTickets: 0,
    resolvedTickets: 0,
    avgResponseTime: "0h",
    resolutionRate: "0%",
    categoryBreakdown: {},
    priorityBreakdown: {},
    statusBreakdown: {}
  });

  useEffect(() => {
    fetchReportData();
  }, [dateRange]);

  const fetchReportData = async () => {
    try {
      setLoading(true);
      const token = sessionStorage.getItem("token");
      const response = await fetch("http://localhost:5000/tickets", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();

      setAllTickets(data);

      const filteredData = filterTicketsByDate(data, dateRange);

      setTickets(filteredData);
      ReportStats(filteredData);
      setLoading(false);
    } catch (error) {
      setLoading(false);
      setTickets([]);
      ReportStats([]);
    }
  };

  //  filtering tickets by date
  const filterTicketsByDate = (tickets, range) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let startDate;

    if (range === "today") {
      startDate = today;
    } else if (range === "week") {
      startDate = new Date(today);
      startDate.setDate(today.getDate() - 7);
    } else if (range === "month") {
      startDate = new Date(today);
      startDate.setMonth(today.getMonth() - 1);
    } else if (range === "quarter") {
      startDate = new Date(today);
      startDate.setMonth(today.getMonth() - 3);
    } else if (range === "year") {
      startDate = new Date(today);
      startDate.setFullYear(today.getFullYear() - 1);
    } else {
      return tickets;
    }

    return tickets.filter(ticket => {
      const ticketDate = new Date(ticket.created_at);
      return ticketDate >= startDate;
    });
  };

  const ReportStats = (ticketData) => {
    const total = ticketData.length;
    const resolved = ticketData.filter((t) => t.status === "Closed" || t.status === "Resolved").length;

    const categories = ticketData.reduce((acc, ticket) => {
      acc[ticket.category] = (acc[ticket.category] || 0) + 1;
      return acc;
    }, {});

    const priorities = ticketData.reduce((acc, ticket) => {
      acc[ticket.priority] = (acc[ticket.priority] || 0) + 1;
      return acc;
    }, {});

    const statuses = ticketData.reduce((acc, ticket) => {
      acc[ticket.status] = (acc[ticket.status] || 0) + 1;
      return acc;
    }, {});

    // Exclude tickets where updated_at === created_at
    const resolvedTickets = ticketData.filter(t =>
      (t.status === 'Closed' || t.status === 'Resolved') &&
      t.updated_at && t.created_at &&
      new Date(t.updated_at).getTime() !== new Date(t.created_at).getTime()
    );

    let average_Response_Time = "No data";

    if (resolvedTickets.length > 0) {
      let totalHours = 0;

      resolvedTickets.forEach(ticket => {
        const created = new Date(ticket.created_at);
        const resolvedDate = new Date(ticket.updated_at);
        const diffMs = resolvedDate - created;
        const diffHours = diffMs / (1000 * 60 * 60);
        totalHours += diffHours;
      });

      const averageHours = totalHours / resolvedTickets.length;

      if (averageHours < 1) {

        const averageMinutes = Math.round(averageHours * 60);

        average_Response_Time = `${averageMinutes} min`;
      } else if (averageHours < 24) {

        let hours = Math.floor(averageHours);

        let mins = Math.round((averageHours - hours) * 60);

        if (mins === 60) {
          hours += 1;
          mins = 0;
        }
        if (mins > 0) {
          let plural  = hours !== 1 ? "s" : "";
          average_Response_Time = `${hours} hr${plural } ${mins} min`;
        } else {
          let plural  = hours !== 1 ? "s" : "";
          average_Response_Time = `${hours} hr${plural}`;
        }
      } else {
        const averageDays = averageHours / 24;
        average_Response_Time = `${averageDays.toFixed(1)} days`;
      }
    }

    let resolutionRate = 0;

    if (total > 0) {
      resolutionRate = ((resolved / total) * 100).toFixed(1);
    }

    setStats({
      totalTickets: total,
      resolvedTickets: resolved,
      avgResponseTime: average_Response_Time,
      resolutionRate: `${resolutionRate}%`,
      categoryBreakdown: categories,
      priorityBreakdown: priorities,
      statusBreakdown: statuses
    });
  };

  //  STATUS PIE CHART
  const statusColors = {
    'Open': '#f59e0b',
    'Closed': '#10b981',
    'In Progress': '#3b82f6',
    'Pending': '#8b5cf6',
    'Resolved': '#06b6d4'
  };
  //status colour for the pi chart
  const renderPieChart = () => {
    if (stats.totalTickets === 0) {
      return (

        <div className="emptyChart">
          <MdPieChart size={48} />
          <p>No status data available</p>
        </div>

      );
    }

    const statusData = stats.statusBreakdown;
    const pieSlices = [];
    let cumulativePercent = 0;

    Object.entries(statusData).forEach(([status, count]) => {
      const percent = (count / stats.totalTickets) * 100;
      const startAngle = cumulativePercent * 3.6;
      const endAngle = (cumulativePercent + percent) * 3.6;
      cumulativePercent += percent;

      const startRad = (startAngle - 90) * Math.PI / 180;
      const endRad = (endAngle - 90) * Math.PI / 180;

      const startX = 50 + 40 * Math.cos(startRad);
      const startY = 50 + 40 * Math.sin(startRad);
      const endX = 50 + 40 * Math.cos(endRad);
      const endY = 50 + 40 * Math.sin(endRad);

      let largeArc = 0;
      if (percent > 50) {
        largeArc = 1;
      }

      let fillColor = statusColors[status];
      if (!fillColor) {
        fillColor = '#94a3b8';
      }

      pieSlices.push(
        <path
          key={status}
          d={`M 50 50 L ${startX} ${startY} A 40 40 0 ${largeArc} 1 ${endX} ${endY} Z`}
          fill={fillColor}
          stroke="#ffffff"
          strokeWidth="1"
          className="pieSlice"
          onMouseEnter={() => {
            setPieTooltip({
              show: true, status: status, count: count,
              percentage: percent.toFixed(1)
            });
          }}
          onMouseLeave={() => {
            setPieTooltip({ show: false, status: '', count: 0, percentage: '' });
          }}
        />
      );
    });

    const legendItems = Object.entries(statusData).map(([status, count]) => {
      const percentage = ((count / stats.totalTickets) * 100).toFixed(1);
      let legendColor = statusColors[status] || '#94a3b8';

      return (
        <div key={status} className="pieLegendItem">
          <span className="pieLegendDot" style={{ backgroundColor: legendColor }}></span>
          <span className="pieLegendLabel">{status}</span>
          <span className="pieLegendValue">{count} ({percentage}%)</span>
        </div>
      );
    });

    return (
      <div className="pieChartLayout">
        <div className="pieChartSvgWrapper">
          <svg viewBox="0 0 100 100" className="pieChartSvg">
            {pieSlices}
          </svg>
          <div className="pieChartCenter">
            <span className="pieChartCenterNumber">{stats.totalTickets}</span>
            <span className="pieChartCenterLabel">Total</span>
          </div>
          {pieTooltip.show && (
            <div className="chartTooltip">
              <span className="chartTooltipTitle">{pieTooltip.status}</span>
              <span className="chartTooltipValue">{pieTooltip.count} tickets ({pieTooltip.percentage}%)</span>
            </div>
          )}
        </div>
        <div className="pieLegend">
          {legendItems}
        </div>
      </div>
    );
  };


  //  CATEGORY DONUT CHART
  const categoryColors = {
    'Network': '#f97316',
    'Software': '#3b82f6',
    'Hardware': '#8b5cf6',
    'Password': '#ec4899',
    'Email': '#06b6d4',
    'Other': '#64748b'
  };

  const renderDonutChart = () => {
    const categoryData = stats.categoryBreakdown;

    if (Object.entries(categoryData).length === 0) {
      return (
        <div className="emptyChart">
          <MdPieChart size={48} />
          <p>No category data available</p>
        </div>
      );
    }

    const total = stats.totalTickets;
    const radius = 36;
    const circumference = 2 * Math.PI * radius;
    const cx = 50;
    const cy = 50;

    let cumulativeOffset = 0;
    const donutSegments = [];
    const entries = Object.entries(categoryData);

    entries.forEach(([category, count]) => {
      const percent = (count / total) * 100;
      const segmentLength = (percent / 100) * circumference;
      const gapSize = 3;

      let strokeColor = categoryColors[category] || '#94a3b8';

      donutSegments.push(
        <circle
          key={category}
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth="12"
          strokeDasharray={`${segmentLength - gapSize} ${circumference - segmentLength + gapSize}`}
          strokeDashoffset={-cumulativeOffset}
          strokeLinecap="butt"
          className="donutSegment"
          transform={`rotate(-90 ${cx} ${cy})`}
          onMouseEnter={() => {
            setDonutTooltip({
              show: true, category: category, count: count,
              percentage: percent.toFixed(1)
            });
          }}
          onMouseLeave={() => {
            setDonutTooltip({ show: false, category: '', count: 0, percentage: '' });
          }}
        />
      );

      cumulativeOffset += segmentLength;
    });

    const legendItems = entries.map(([category, count]) => {
      const percentage = ((count / total) * 100).toFixed(1);
      let legendColor = categoryColors[category] || '#94a3b8';

      return (
        <div key={category} className="donutLegendItem">
          <span className="donutLegendDot" style={
            {
              backgroundColor: legendColor
            }}></span>

          <span className="donutLegendLabel">{category}</span>
          <span className="donutLegendValue">{count} ({percentage}%)</span>
        </div>
      );
    });

    return (
      <div className="donutChartLayout">
        <div className="donutChartSvgWrapper">
          <svg viewBox="0 0 100 100" className="donutChartSvg">
            {donutSegments}
          </svg>

          <div className="donutChartCenter">

            <span className="donutChartCenterNumber">
              {entries.length}
            </span>
            <span className="donutChartCenterLabel">
              Categories
            </span>
          </div>

          {donutTooltip.show && (
            <div className="chartTooltip">
              <span className="chartTooltipTitle">{donutTooltip.category}</span>
              <span className="chartTooltipValue">{donutTooltip.count} tickets ({donutTooltip.percentage}%)</span>
            </div>
          )}
        </div>

        <div className="donutLegend">
          {legendItems}
        </div>
      </div>
    );
  };


  //  7-DAY LINE CHART
  const getTicketTrendsData = () => {
    const trendsData = [];
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateString = date.toISOString().split('T')[0];

      let count = 0;
      allTickets.forEach(ticket => {
        const ticketDate = new Date(ticket.created_at).toISOString().split('T')[0];
        if (ticketDate === dateString) {
          count = count + 1;
        }
      });

      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });

      trendsData.push({ day: dayName, date: dateString, count: count });
    }

    return trendsData;
  };

  const renderLineChart = () => {
    const trendsData = getTicketTrendsData();

    if (allTickets.length === 0) {
      return (
        <div className="emptyChart">
          <MdShowChart size={48} />
          <p>No trend data available</p>
        </div>
      );
    }

    let maxCount = 0;
    trendsData.forEach(item => {
      if (item.count > maxCount) {
        maxCount = item.count;
      }
    });
    if (maxCount === 0) {
      maxCount = 1;
    }

    const chartWidth = 500;
    const chartHeight = 200;
    const padLeft = 40;
    const padRight = 20;
    const padTop = 20;
    const padBottom = 40;
    const plotWidth = chartWidth - padLeft - padRight;
    const plotHeight = chartHeight - padTop - padBottom;

    const pointsArray = [];
    const areaPoints = [];

    trendsData.forEach((item, index) => {
      const x = padLeft + (index * (plotWidth / (trendsData.length - 1)));
      const y = padTop + plotHeight - ((item.count / maxCount) * plotHeight);
      pointsArray.push(`${x},${y}`);
      areaPoints.push({ x, y });
    });

    const pointsString = pointsArray.join(' ');

    let areaPath = `M ${areaPoints[0].x} ${areaPoints[0].y}`;
    areaPoints.forEach((point, i) => {
      if (i > 0) {
        areaPath += ` L ${point.x} ${point.y}`;
      }
    });
    areaPath += ` L ${areaPoints[areaPoints.length - 1].x} ${padTop + plotHeight}`;
    areaPath += ` L ${areaPoints[0].x} ${padTop + plotHeight} Z`;

    const dataPoints = [];
    trendsData.forEach((item, index) => {
      const x = padLeft + (index * (plotWidth / (trendsData.length - 1)));
      const y = padTop + plotHeight - ((item.count / maxCount) * plotHeight);

      const handleMouseEnter = () => {
        let tooltipX = x;
        if (x < 80) tooltipX = 80;
        if (x > chartWidth - 80) tooltipX = chartWidth - 80;

        let tooltipY = y < 60 ? y + 55 : y - 15;

        setLineTooltip({
          show: true, x: tooltipX, y: tooltipY,
          day: item.day, date: item.date, count: item.count
        });
      };

      const handleMouseLeave = () => {
        setLineTooltip({ show: false, x: 0, y: 0, day: '', date: '', count: 0 });
      };

      dataPoints.push(
        <circle
          key={index}
          cx={x}
          cy={y}
          r="5"
          fill="#ffffff"
          stroke="#f97316"
          strokeWidth="2.5"
          className="lineDataPoint"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          style={{ cursor: 'pointer' }}
        />
      );
    });

    const xLabels = trendsData.map((item, index) => {
      const x = padLeft + (index * (plotWidth / (trendsData.length - 1)));
      return (
        <text key={index} x={x} y={chartHeight - 10} textAnchor="middle"
          fontSize="11" fontWeight="600" fill="#737373"
          fontFamily="Plus Jakarta Sans, sans-serif">
          {item.day}
        </text>
      );
    });

    const yElements = [];
    for (let i = 0; i <= 4; i++) {
      const value = Math.round((maxCount / 4) * i);
      const y = padTop + plotHeight - ((i / 4) * plotHeight);

      yElements.push(
        <g key={i}>
          <line x1={padLeft} y1={y} x2={chartWidth - padRight} y2={y}
            stroke="#f5f5f5" strokeWidth="1"
            strokeDasharray={i === 0 ? "none" : "4,4"} />
          <text x={padLeft - 8} y={y + 4} textAnchor="end"
            fontSize="11" fontWeight="500" fill="#a3a3a3"
            fontFamily="Plus Jakarta Sans, sans-serif">
            {value}
          </text>
        </g>
      );
    }

    return (
      <div className="lineChartWrapper">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="lineChartSvg" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f97316" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#f97316" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {yElements}
          {xLabels}

          <path d={areaPath} fill="url(#areaGradient)" />

          <polyline points={pointsString} fill="none" stroke="#f97316"
            strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

          {dataPoints}

          {lineTooltip.show && (
            <g>
              <rect x={lineTooltip.x - 50} y={lineTooltip.y - 38}
                width="100" height="34" rx="6" fill="#262626" />
              <text x={lineTooltip.x} y={lineTooltip.y - 22}
                textAnchor="middle" fontSize="12" fontWeight="bold" fill="#ffffff"
                fontFamily="Plus Jakarta Sans, sans-serif">
                {lineTooltip.count} ticket{lineTooltip.count !== 1 ? 's' : ''}
              </text>
              <text x={lineTooltip.x} y={lineTooltip.y - 9}
                textAnchor="middle" fontSize="10" fill="#a3a3a3"
                fontFamily="Plus Jakarta Sans, sans-serif">
                {lineTooltip.day}, {lineTooltip.date}
              </text>
            </g>
          )}
        </svg>

        <div className="trendSummary">
          <p>Last 7 days ticket activity</p>
        </div>
      </div>
    );
  };

  const handleExportReport = () => {
    const csvContent = [
      ["Ticket ID", "Title", "Category", "Priority", "Status", "Created At"].join(","),
      ...tickets.map((t) =>
        [
          t.ticket_id,
          `"${(t.title || '').replace(/"/g, '""')}"`,
          t.category,
          t.priority,
          t.status,
          new Date(t.created_at).toLocaleDateString()
        ].join(",")
      )
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `support-report-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  return (
    <div className="reportsLayout">
      <Sidebar />

      <main className="reportsMain">
        <div className="reportsContainer">
          {/* top bar */}
          <div className="reportsTopBar">
            <div>
              <h1>Reports</h1>
              <p>Your performance and ticket analytics</p>
            </div>
            <div className="reportsTopBarRight">
              <button className="exportButton" onClick={handleExportReport}>
                <MdDownload size={16} />
                Export CSV
              </button>
            </div>
          </div>

          {/* date and type filters */}
          <div className="filterControls">
            <div className="filterGroup">
              <label className="filterLabel">Date Range:</label>
              <select value={dateRange} onChange={(e) => setDateRange(e.target.value)} className="filterSelect">
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="quarter">This Quarter</option>
                <option value="year">This Year</option>
                <option value="all">All Time</option>
              </select>
            </div>
            <div className="filterGroup">
              <label className="filterLabel">Report Type:</label>
              <select value={reportType} onChange={(e) => setReportType(e.target.value)} className="filterSelect">
                <option value="overview">Overview</option>
                <option value="category">By Category</option>
                <option value="priority">By Priority</option>
              </select>
            </div>
          </div>

          {/* stats */}
          {(reportType === "overview" || reportType === "performance") && (
            <div className="metricsGrid">
              <div className="metricCard metricTotal">
                <div className="metricHeader">
                  <div className="metricIconWrapper">
                    <IoStatsChart size={24} />
                  </div>
                  <MdTrendingUp className="metricTrend" size={20} />
                </div>
                <div className="metricBody">
                  <h3>Total Tickets</h3>
                  <p className="metricNumber">{stats.totalTickets}</p>
                  <span className="metricLabel">All time</span>
                </div>
              </div>

              <div className="metricCard metricResolved">
                <div className="metricHeader">
                  <div className="metricIconWrapper">
                    <IoCheckmarkDone size={24} />
                  </div>
                  <MdTrendingUp className="metricTrend" size={20} />
                </div>
                <div className="metricBody">

                  <h3>Resolved</h3>

                  <p className="metricNumber">{stats.resolvedTickets}</p>

                  <span className="metricLabel">Successfully closed</span>
                </div>
              </div>

              <div className="metricCard metricResponse">
                <div className="metricHeader">
                  <div className="metricIconWrapper">
                    <IoTimeOutline size={24} />
                  </div>
                  <MdTrendingUp className="metricTrend" size={20} />
                </div>


                <div className="metricBody">

                  <h3>Avg Response</h3>

                  <p className="metricNumber">
                    {stats.avgResponseTime}
                  </p>
                  <span className="metricLabel">Average time</span>
                </div>
              </div>

              <div className="metricCard metricRate">
                <div className="metricHeader">
                  <div className="metricIconWrapper">
                    <MdAssessment size={24} />
                  </div>
                  <MdTrendingUp className="metricTrend" size={20} />
                </div>
                <div className="metricBody">
                  <h3>Resolution Rate</h3>
                  <p className="metricNumber">{stats.resolutionRate}</p>
                  <span className="metricLabel">Success rate</span>
                </div>
              </div>
            </div>
          )}

          {/* charts */}
          {(reportType === "overview" || reportType === "performance") && (
            <div className="chartsGrid">
              <div className="chartCard">
                <div className="chartHeader">
                  <div className="chartHeaderLeft">
                    <MdPieChart size={24} className="chartIcon" />
                    <h3>Status Distribution</h3>
                  </div>
                </div>
                <div className="chartBody">
                  {renderPieChart()}
                </div>
              </div>

              <div className="chartCard">
                <div className="chartHeader">
                  <div className="chartHeaderLeft">
                    <HiChartBar size={24} className="chartIcon" />
                    <h3>Category Breakdown</h3>
                  </div>
                </div>
                <div className="chartBody">
                  {renderDonutChart()}
                </div>
              </div>
            </div>
          )}

          {/* trend line */}
          {(reportType === "overview" || reportType === "performance") && (
            <div className="lineChartSection">
              <div className="chartCard">
                <div className="chartHeader">
                  <div className="chartHeaderLeft">
                    <MdShowChart size={24} className="chartIcon" />
                    <h3>Ticket Trends (Last 7 Days)</h3>
                  </div>
                  <MdTrendingUp size={20} className="chartIconAlt" />
                </div>
                <div className="chartBody">
                  {renderLineChart()}
                </div>
              </div>
            </div>
          )}

          {/* category + priority breakdown */}
          <div className="chartsGrid">
            {/* by category */}
            {(reportType === "overview" || reportType === "category" || reportType === "performance") && (
              <div className="chartCard">
                <div className="chartHeader">
                  <div className="chartHeaderLeft">
                    <MdPieChart size={24} className="chartIcon" />
                    <h3>Tickets by Category</h3>
                  </div>
                  <HiChartBar size={20} className="chartIconAlt" />
                </div>
                <div className="chartBody">
                  {Object.entries(stats.categoryBreakdown).length > 0 ? (
                    <div className="barChartWrapper">
                      {Object.entries(stats.categoryBreakdown).map(
                        ([category, count]) => {
                          const percentage = (
                            (count / stats.totalTickets) * 100
                          ).toFixed(1);
                          return (
                            <div key={category} className="barChartRow">
                              <div className="barLabel">
                                <span className="barCategory">{category}</span>
                                <span className="barCount">
                                  {count} ({percentage}%)
                                </span>
                              </div>
                              <div className="barTrack">
                                <div
                                  className="barFill"
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                            </div>
                          );
                        }
                      )}
                    </div>
                  ) : (
                    <div className="emptyChart">
                      <MdPieChart size={48} />
                      <p>No category data available</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* by priority */}
            {(reportType === "overview" || reportType === "priority" || reportType === "performance") && (
              <div className="chartCard">
                <div className="chartHeader">
                  <div className="chartHeaderLeft">
                    <MdShowChart size={24} className="chartIcon" />
                    <h3>Tickets by Priority</h3>
                  </div>
                  <HiDocumentReport size={20} className="chartIconAlt" />
                </div>


                <div className="chartBody">
                  {Object.entries(stats.priorityBreakdown).length > 0 ? (

                    <div className="priorityGrid">

                      {Object.entries(stats.priorityBreakdown)
                        .sort((a, b) => {
                          const order =
                          {
                            "Critical": 0, "High": 1, "Medium": 2, "Low": 3

                          };
                          return (order[a[0]] || 4) - (order[b[0]] || 4);
                        })
                        .map(([priority, count]) => {
                          const percentage = (
                            (count / stats.totalTickets) * 100
                          ).toFixed(1);
                          return (
                            <div
                              key={priority}
                              className={`priorityItem priority-${priority.toLowerCase()}`}
                            >
                              <div className="priorityHeader">
                                <span className="priorityLabel">{priority}</span>
                                <span className="priorityPercentage">
                                  {percentage}%
                                </span>
                              </div>
                              <p className="priorityCount">{count}</p>
                              <div className="priorityBar">
                                <div
                                  className="priorityBarFill"
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                            </div>
                          );
                        }
                        )}
                    </div>
                  ) : (
                    <div className="emptyChart">
                      <MdShowChart size={48} />
                      <p>No priority data available</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* status cards */}
          {(reportType === "overview" || reportType === "performance") && (
            <div className="statusOverview">
              <div className="sectionHeader">
                <div className="sectionHeaderLeft">
                  <MdBarChart size={24} />
                  <h2>Status Distribution</h2>
                </div>
              </div>
              <div className="statusGrid">
                {Object.entries(stats.statusBreakdown).map(([status, count]) => {
                  const percentage = (
                    (count / stats.totalTickets) * 100
                  ).toFixed(1);
                  return (
                    <div
                      key={status}
                      className={`statusCard status-${status
                        .toLowerCase()
                        .replace(" ", "-")}`}
                    >
                      <h4>{status}</h4>
                      <p className="statusNumber">{count}</p>
                      <div className="statusProgress">
                        <div
                          className="statusProgressFill"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <span className="statusPercentage">{percentage}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/*tickets */}
          {reportType === "overview" && (
            <div className="activitySummary">
              <div className="sectionHeader">
                <div className="sectionHeaderLeft">
                  <HiDocumentReport size={24} />
                  <h2>Recent Activity</h2>
                </div>
              </div>
              <div className="activityList">
                {tickets.slice(0, 5).map((ticket) => (
                  <div key={ticket.ticket_id} className="activityItem">
                    <div className="activityIcon">
                      <MdBarChart size={20} />
                    </div>
                    <div className="activityContent">
                      <p className="activityTitle">
                        <Link to="/tickets" className="ticketLink">
                          <strong>{ticket.ticket_id}</strong>
                        </Link>
                        {" "}- {ticket.title}
                      </p>
                      <p className="activityMeta">
                        {ticket.category} • {ticket.priority} •{" "}
                        {new Date(ticket.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span
                      className={`activityStatus status-${ticket.status
                        .toLowerCase()
                        .replace(" ", "-")}`}
                    >
                      {ticket.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

export default SupporterReports;
