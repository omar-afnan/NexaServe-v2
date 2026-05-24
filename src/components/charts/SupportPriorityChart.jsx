import { MdShowChart } from "react-icons/md";

function SupportPriorityChart({ priorityBreakdown, totalTickets }) {
  if (Object.entries(priorityBreakdown).length > 0) {
    return (
      <div className="priorityGrid">

        {Object.entries(priorityBreakdown)
          .sort((a, b) => {
            const order =
            {
              "Critical": 0, "High": 1, "Medium": 2, "Low": 3

            };
            return (order[a[0]] || 4) - (order[b[0]] || 4);
          })
          .map(([priority, count]) => {
            const percentage = (
              (count / totalTickets) * 100
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
    );
  }
  return (
    <div className="emptyChart">
      <MdShowChart size={48} />
      <p>No priority data available</p>
    </div>
  );
}

export default SupportPriorityChart;
