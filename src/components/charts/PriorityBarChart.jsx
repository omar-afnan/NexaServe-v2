function PriorityBarChart({ stats }) {
  if (stats.totalTickets > 0) {
    return (
      <>
        <div className="statusItem">
          <div className="statusLabel">
            <span>Critical Priority</span>
            <span className="statusCount">{stats.criticalPriorityTickets}</span>
          </div>
          <div className="statusBarTrack">
            <div className="criticalBar" style={{ width: `${(stats.criticalPriorityTickets / stats.totalTickets) * 100}%` }}></div>
          </div>
        </div>
        <div className="statusItem">
          <div className="statusLabel">
            <span>High Priority</span>
            <span className="statusCount">{stats.highPriorityTickets}</span>
          </div>
          <div className="statusBarTrack">
            <div className="highBar" style={{ width: `${(stats.highPriorityTickets / stats.totalTickets) * 100}%` }}></div>
          </div>
        </div>
        <div className="statusItem">
          <div className="statusLabel">
            <span>Medium Priority</span>
            <span className="statusCount">{stats.mediumPriorityTickets}</span>
          </div>
          <div className="statusBarTrack">
            <div className="mediumBar" style={{ width: `${(stats.mediumPriorityTickets / stats.totalTickets) * 100}%` }}></div>
          </div>
        </div>
        <div className="statusItem">
          <div className="statusLabel">
            <span>Low Priority</span>
            <span className="statusCount">{stats.lowPriorityTickets}</span>
          </div>
          <div className="statusBarTrack">
            <div className="lowBar" style={{ width: `${(stats.lowPriorityTickets / stats.totalTickets) * 100}%` }}></div>
          </div>
        </div>
      </>
    );
  }
  return <p className="emptyMessage">No ticket data available</p>;
}

export default PriorityBarChart;
