function SupportStatusChart({ statusBreakdown, totalTickets }) {
  return (
    <div className="statusGrid">
      {Object.entries(statusBreakdown).map(([status, count]) => {
        const percentage = (
          (count / totalTickets) * 100
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
  );
}

export default SupportStatusChart;
