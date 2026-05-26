import {
  useState,
  useEffect
} from "react";

import { useNavigate } from "react-router-dom";

import {
  MdBarChart,
  MdReceipt,
  MdGroup,
  MdSchedule,
  MdCheckCircle,
  MdWarning,
  MdTimer,
  MdPieChart,
  MdTrendingUp,
  MdList,
  MdShowChart,
  MdDownload,
  MdRefresh,
  MdLabel,
} from "react-icons/md";

import {
  IoStatsChart
} from "react-icons/io5";
import {
  HiSparkles
} from "react-icons/hi2";

import "./CSS/AdminReports.css";
import AdminSideBar from "../components/AdminSideBar";
import fetchWithAuth from "../api/fetchWithAuth";
import StatusPieChart from "../components/charts/StatusPieChart";
import PriorityBarChart from "../components/charts/PriorityBarChart";
import TicketTrendsChart from "../components/charts/TicketTrendsChart";

function AdminReports() {

  const navigate = useNavigate();

  const [tickets, setTickets] = useState([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState(null);

  const [stats, setStats] = useState({

    totalTickets: 0,

    totalUsers: 0,

    openTickets: 0,

    closedTickets: 0,

    highPriorityTickets: 0,

    avgResolutionTime: "0 days"
  });

  const [tooltip, setTooltip] = useState({
    show: false,
    x: 0,
    y: 0,
    day: '',
    date: '',
    count: 0
  });

  // ML States
  const [mlStats, setMlStats] = useState(null);

  const [mlLoading, setMlLoading] = useState(false);

  const [mlError, setMlError] = useState(null);

  const [testInput, setTestInput] = useState("");

  const [testResult, setTestResult] = useState(null);

  useEffect(() => {

    fetchReportsData();

    fetchMLStats();
  }, []);

  // fetch ML stats function from prediction api 
  const fetchMLStats = async () => {
    try {
      setMlLoading(true);
      setMlError(null);

      const response = await fetch("http://localhost:5006/stats");

      if (!response.ok) {
        throw new Error("ML Service unavailable");
      }

      const data = await response.json();
      setMlStats(data);

      setMlLoading(false);
    }
    catch (err) {
      setMlError(err.message);

      setMlLoading(false);
    }
  };

  // ml prediction test function
  const testPrediction = async () => {
    if (!testInput.trim()) return;

    try {
      const response = await fetch("http://localhost:5006/predict", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",


        },
        body: JSON.stringify({
          title: testInput,
          description: ""
        })
      });

      if (!response.ok) {
        setTestResult({ error: `Prediction service error (${response.status})` });
        return;
      }

      const data = await response.json();

      setTestResult(data);

    } catch (err) {
      setTestResult({ error: err.message });
    }
  };

  const fetchReportsData = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = sessionStorage.getItem('token');


      const response = await fetchWithAuth('http://localhost:5000/tickets', {
        headers: token ? {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        } : {}
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();


      if (Array.isArray(data)) {
        setTickets(data);
        calculateStats(data);

      } else {

        setTickets([]);
        calculateStats([]);
      }

      setLoading(false);
    } catch (error) {

      setError(error.message);

      setTickets([]);
      setLoading(false);
    }
  };

  const calculateStats = (ticketsData) => {

    const resolvedTickets = ticketsData.filter(t =>
      (t.status === 'Closed' || t.status === 'Resolved') &&
      t.updated_at && t.created_at &&
      new Date(t.updated_at).getTime() !== new Date(t.created_at).getTime()
    );

    let avgResolutionTime = "No data";

    if (resolvedTickets.length > 0) {
      let totalHours = 0;

      resolvedTickets.forEach(ticket => {
        const created = new Date(ticket.created_at);

        const resolved = new Date(ticket.updated_at);

        const timeDiff = resolved - created;

        const diffHours = timeDiff / (1000 * 60 * 60);
        totalHours += diffHours;
      });

      const avgHours = totalHours / resolvedTickets.length;

      if (avgHours < 1) {
        const avgMinutes = Math.round(avgHours * 60);
        avgResolutionTime = `${avgMinutes} min`;

      }
      else if (avgHours < 24) {

        let hrs = Math.floor(avgHours);
        let mins = Math.round((avgHours - hrs) * 60);

        if (mins === 60) {
          hrs += 1;
          mins = 0;
        }
        if (mins > 0) {
          let plural = '';
          if (hrs !== 1) {
            plural = 's';
          }
          avgResolutionTime = `${hrs} hr${plural} ${mins} min`;
        } else {
          let plural = '';
          if (hrs !== 1) {
            plural = 's';
          }
          avgResolutionTime = `${hrs} hr${plural}`;
        }
      }
      else {
        const avgDays = avgHours / 24;
        avgResolutionTime = `${avgDays.toFixed(1)} days`;
      }
    }

    const priorityCounts = {
      Critical: ticketsData.filter(t => t.priority === 'Critical').length,

      High: ticketsData.filter(t => t.priority === 'High').length,

      Medium: ticketsData.filter(t => t.priority === 'Medium').length,

      Low: ticketsData.filter(t => t.priority === 'Low').length,

      Other: ticketsData.filter(t => !['Critical', 'High', 'Medium', 'Low'].includes(t.priority)).length
    };

    const stats = {
      totalTickets: ticketsData.length,

      totalUsers: new Set(ticketsData.map(t => t.created_by)).size,

      openTickets: ticketsData.filter(t => t.status === 'Open').length,

      closedTickets: ticketsData.filter(t => t.status === 'Closed' || t.status === 'Resolved').length,

      criticalPriorityTickets: priorityCounts.Critical,

      highPriorityTickets: priorityCounts.High,

      mediumPriorityTickets: priorityCounts.Medium,

      lowPriorityTickets: priorityCounts.Low,

      otherPriorityTickets: priorityCounts.Other,
      avgResolutionTime: avgResolutionTime
    };

    setStats(stats);
  };

  const getCategoryData = () => {
    const categories = {};
    tickets.forEach(ticket => {
      categories[ticket.category] = (categories[ticket.category] || 0) + 1;
    });
    return categories;
  };

  const categoryData = getCategoryData();

  const getStatusData = () => {
    const statuses = {};
    tickets.forEach(ticket => {
      statuses[ticket.status] = (statuses[ticket.status] || 0) + 1;
    });
    return statuses;
  }

  const statusData = getStatusData();

  const handleExportCSV = () => {
    const csvContent = [
      ["Ticket ID", "Title", "Category", "Priority", "Status", "Created At"].join(","),
      ...tickets.map(ticket => [
        ticket.ticket_id,
        `"${ticket.title?.replace(/"/g, '""') || ''}"`,
        ticket.category,
        ticket.priority,
        ticket.status,
        ticket.created_at
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `admin-report-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };



  return (
    <div className="adminReportsLayout">
      <AdminSideBar />

      <div className="adminReportsMain">
        <header className="reportsHero">
          <div className="heroContent">

            <h1>
              <MdBarChart size={22} style={
                {
                  marginRight: 8, verticalAlign: 'middle', backgroundColor: '#0f766e', color: '#fff', borderRadius: '4px', padding: '2px'
                }} />
              System Reports and Analytics
            </h1>
          </div>
          <button className="exportBtn" onClick={handleExportCSV}>
            <MdDownload size={16} />
            Export CSV
          </button>
        </header>

        {loading ? (
          <div className="loadingState">
            <div className="spinner"></div>
            <p>Loading reports data</p>
          </div>
        ) : error ? (
          <div className="errorState">
            <p>Error: {error}</p>
            <button onClick={fetchReportsData}>Try Again</button>
          </div>
        ) : (
          <>

            <div className="metricsGrid">
              <div className="metricCard">
                <div className="metricIcon">
                  <MdReceipt size={36} />
                </div>
                <div className="metricInfo">
                  <h3>Total Tickets</h3>
                  <p className="metricValue">{stats.totalTickets}</p>
                  <span className="metricLabel">All time</span>
                </div>
              </div>

              <div className="metricCard">
                <div className="metricIcon">
                  <MdGroup size={36} />
                </div>
                <div className="metricInfo">
                  <h3>Total Users</h3>
                  <p className="metricValue">{stats.totalUsers}</p>
                  <span className="metricLabel">Active users</span>
                </div>
              </div>

              <div className="metricCard">
                <div className="metricIcon">
                  <MdSchedule size={36} />
                </div>
                <div className="metricInfo">
                  <h3>Open Tickets</h3>
                  <p className="metricValue">{stats.openTickets}</p>
                  <span className="metricLabel">Pending</span>
                </div>
              </div>

              <div className="metricCard">
                <div className="metricIcon">
                  <MdCheckCircle size={36} />
                </div>
                <div className="metricInfo">
                  <h3>Resolved</h3>
                  <p className="metricValue">{stats.closedTickets}</p>
                  <span className="metricLabel">Completed</span>
                </div>
              </div>

              <div className="metricCard">
                <div className="metricIcon">
                  <MdWarning size={36} />
                </div>
                <div className="metricInfo">
                  <h3>Critical Priority</h3>
                  <p className="metricValue">{stats.criticalPriorityTickets}</p>
                  <span className="metricLabel">Critical</span>
                </div>
              </div>

              <div className="metricCard">
                <div className="metricIcon">
                  <MdWarning size={36} />
                </div>
                <div className="metricInfo">
                  <h3>High Priority</h3>
                  <p className="metricValue">{stats.highPriorityTickets}</p>
                  <span className="metricLabel">Urgent</span>
                </div>
              </div>

              <div className="metricCard">
                <div className="metricIcon">
                  <MdWarning size={36} />
                </div>
                <div className="metricInfo">
                  <h3>Medium Priority</h3>
                  <p className="metricValue">{stats.mediumPriorityTickets}</p>
                  <span className="metricLabel">Medium</span>
                </div>
              </div>

              <div className="metricCard">
                <div className="metricIcon">
                  <MdWarning size={36} />
                </div>
                <div className="metricInfo">
                  <h3>Low Priority</h3>
                  <p className="metricValue">{stats.lowPriorityTickets}</p>
                  <span className="metricLabel">Low</span>
                </div>
              </div>

              <div className="metricCard">
                <div className="metricIcon">
                  <MdTimer size={36} />
                </div>
                <div className="metricInfo">
                  <h3>Avg Resolution</h3>
                  <p className="metricValue">{stats.avgResolutionTime}</p>
                  <span className="metricLabel">Average time</span>
                </div>
              </div>
            </div>

            {/* Charts*/}
            <div className="chartsGrid">
              <div className="chartCard">
                <h2>
                  <MdPieChart size={24} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                  Ticket Status Distribution
                </h2>
                <div className="chartContent">
                  <div className="pieChartContainer">
                    <StatusPieChart statusData={statusData} totalTickets={stats.totalTickets} />
                  </div>
                </div>
              </div>

              <div className="chartCard">
                <h2>
                  <MdTrendingUp size={24} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                  Tickets by Priority
                </h2>
                <div className="chartContent">
                  <PriorityBarChart stats={stats} />
                </div>
              </div>
            </div>

            {/* Line Chart  */}
            <div className="lineChartSection">
              <div className="chartCardFull">
                <h2>
                  <MdShowChart size={24} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                  Ticket Trends (Last 7 Days)
                </h2>
                <div className="chartContent">
                  <TicketTrendsChart tickets={tickets} tooltip={tooltip} setTooltip={setTooltip} />
                </div>
              </div>
            </div>

            {/*predictive analysis  */}
            <div className="mlSection">
              <div className="mlSectionHeader">
                <h2>
                  <IoStatsChart size={24} style={
                    {
                      marginRight: 8, verticalAlign: 'middle'
                    }} />
                  ML Predictive Analysis
                </h2>
                <button onClick={fetchMLStats} className="mlRefreshBtn">
                  <MdRefresh size={18} />
                  Refresh
                </button>
              </div>

              {mlLoading ? (
                <div className="mlLoading">
                  <div className="spinner"></div>
                  <p>Loading ML Analysis</p>
                </div>
              ) : mlError ? (
                <div className="mlError">
                  <p>ML Service Unavailable</p>
                  <span>Run:python PredictionApi.py</span>
                </div>
              ) : mlStats ? (
                <>

                  <div className="mlModelInfo">
                    <div className="mlModelCard">
                      <span className="mlModelLabel">mBERT</span>
                      <span className="mlModelValue">
                        {mlStats.model_info?.category_accuracy != null
                          ? `${mlStats.model_info.category_accuracy}%`
                          : 'N/A'}
                      </span>
                    </div>
                    <div className="mlModelCard">
                      <span className="mlModelLabel">Priority Accuracy</span>
                      <span className="mlModelValue">{mlStats.model_info?.priority_accuracy != null ? `${mlStats.model_info.priority_accuracy}%` : 'N/A'}</span>
                    </div>
                    <div className="mlModelCard">
                      <span className="mlModelLabel">Last Trained</span>
                      <span className="mlModelValue">
                        {mlStats.model_info?.trained_at
                          ? new Date(mlStats.model_info.trained_at).toLocaleDateString()
                          : 'N/A'}
                      </span>
                    </div>
                    <div className="mlModelCard">
                      <span className="mlModelLabel">Total Analyzed</span>
                      <span className="mlModelValue">{mlStats.total_tickets || 0}</span>
                    </div>
                  </div>

                  {/* ML Trends Grid */}
                  <div className="mlTrendsGrid">
                    {/* Category Trends */}
                    <div className="mlTrendCard">
                      <h3>
                        <MdBarChart size={20} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                        Category Trends (This Week vs Last)
                      </h3>
                      <div className="mlTrendTable">
                        <div className="mlTrendHeader">
                          <span>Category</span>
                          <span>Last Week</span>
                          <span>This Week</span>
                        </div>
                        {mlStats.category_trends && Array.isArray(mlStats.category_trends) && mlStats.category_trends.length > 0 ? (
                          mlStats.category_trends.map((trend) => (
                            <div key={trend.category || trend.category + trend.last_week} className="mlTrendRow">
                              <span className="mlTrendCategory">
                                {trend.category || 'Unknown'}
                              </span>

                              <span className="mlTrendCount">
                                {trend.last_week || 0}
                              </span>

                              <span className="mlTrendCount">
                                {trend.this_week || 0}
                              </span>

                            </div>
                          ))
                        ) : (
                          <div className="mlTrendRow">
                            <p>
                              No category trend data available
                            </p>
                          </div>
                        )}
                      </div>
                    </div>


                    <div className="mlTrendCard">
                      <h3>
                        <MdLabel size={20} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                        Common Issue Keywords
                      </h3>
                      <div className="mlKeywordCloud">
                        {mlStats.common_keywords?.slice(0, 12).map((kw) => (
                          <span key={kw.word} className="mlKeywordTag">
                            {kw.word}
                            <span className="mlKeywordCount">{kw.count}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>



                  {/* Test Prediction */}
                  <div className="mlTestSection">
                    <h3>
                      <HiSparkles size={20} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                      Test ML Prediction
                    </h3>
                    <div className="mlTestInputWrapper">
                      <input
                        type="text"
                        className="mlTestInput"
                        placeholder="Enter ticket title to test prediction..."
                        value={testInput}
                        onChange={(e) => setTestInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && testPrediction()}
                      />
                      <button onClick={testPrediction} className="mlTestBtn">Predict</button>
                    </div>

                    {testResult && (
                      <div className="mlTestResult">
                        {testResult.error ? (
                          <p className="mlTestError">Error: {testResult.error}</p>
                        ) : (
                          <div className="mlPredictionCards">
                            {/* Category Card */}
                            <div className="mlPredictionCard">
                              <div className="mlPredictionHeader">
                                <span className="mlPredLabel">PREDICTED CATEGORY</span>
                                <span className="mlPredValue">{testResult.predicted_category}</span>
                              </div>
                              <div className="mlConfidenceBars">
                                {testResult.category_probabilities ? (
                                  Object.entries(testResult.category_probabilities)
                                    .sort((a, b) => b[1] - a[1])
                                    .map(([cat, conf]) => (
                                      <div key={cat} className="mlConfidenceRow">
                                        <span className="mlConfidenceLabel">{cat}</span>
                                        <div className="mlConfidenceBarTrack">
                                          <div
                                            className={`mlConfidenceBar ${cat === testResult.predicted_category ? 'active' : ''}`}
                                            style={{ width: `${(conf * 100)}%` }}
                                          />
                                        </div>
                                        <span className="mlConfidencePercent">{(conf * 100).toFixed(1)}%</span>
                                      </div>
                                    ))
                                ) : (
                                  <p>{(testResult.category_confidence * 100).toFixed(1)}% confidence</p>
                                )}
                              </div>
                            </div>

                            {/* Priority*/}
                            <div className="mlPredictionCard">
                              <div className="mlPredictionHeader">
                                <span className="mlPredLabel">PREDICTED PRIORITY</span>
                                <span className="mlPredValue">{testResult.predicted_priority}</span>
                              </div>
                              <div className="mlConfidenceBars">
                                {testResult.priority_probabilities ? (
                                  Object.entries(testResult.priority_probabilities)
                                    .sort((a, b) => {
                                      const order = { 'Critical': 0, 'High': 1, 'Medium': 2, 'Low': 3 };
                                      return order[a[0]] - order[b[0]];
                                    })
                                    .map(([pri, conf]) => (
                                      <div key={pri} className="mlConfidenceRow">
                                        <span className="mlConfidenceLabel">{pri}</span>
                                        <div className="mlConfidenceBarTrack">
                                          <div
                                            className={`mlConfidenceBar priority-${pri.toLowerCase()} ${pri === testResult.predicted_priority ? 'active' : ''}`}
                                            style={{ width: `${(conf * 100)}%` }}
                                          />
                                        </div>
                                        <span className="mlConfidencePercent">{(conf * 100).toFixed(1)}%</span>
                                      </div>
                                    ))
                                ) : (
                                  <p>{(testResult.priority_confidence * 100).toFixed(1)}% confidence</p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>

            {/*  tickets Table */}
            <div className="recentActivity">
              <h2>
                <MdList size={24} style=
                  {
                    {
                      marginRight: 8, verticalAlign: 'middle'
                    }
                  } />
                Recent System Activity
              </h2>

              {tickets.length > 0 ? (
                <div className="activityTable">
                  <table>
                    <thead>
                      <tr>

                        <th>ID</th>
                        <th>Title</th>
                        <th>Category</th>
                        <th>Priority</th>
                        <th>Status</th>
                        <th>Created</th>
                      </tr>

                    </thead>
                    <tbody>
                      {tickets
                        .slice()
                        .sort((a, b) => {
                          const priorityOrder = { "Critical": 0, "High": 1, "Medium": 2, "Low": 3, "Other": 4 };
                          const getPriorityIndex = (p) => priorityOrder[p] !== undefined ? priorityOrder[p] : priorityOrder["Other"];
                          return getPriorityIndex(a.priority) - getPriorityIndex(b.priority);
                        })
                        .slice(0, 10)
                        .map(ticket => (
                          <tr key={ticket.ticket_id}>

                            <td>{ticket.ticket_id}</td>

                            <td>{ticket.title}</td>

                            <td>{ticket.category}</td>
                            <td>
                              <span className={`priority-${ticket.priority ? ticket.priority.toLowerCase() : 'other'}`}>
                                {ticket.priority || 'Other'}
                              </span>
                            </td>
                            <td>
                              <span className={`status-${ticket.status.toLowerCase().replace(' ', '-')}`}>
                                {ticket.status}
                              </span>
                            </td>
                            <td>{new Date(ticket.created_at).toLocaleDateString()}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="emptyMessage">No recent activity to display</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default AdminReports;
