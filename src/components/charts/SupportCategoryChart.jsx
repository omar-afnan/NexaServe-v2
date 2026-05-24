import { MdPieChart } from "react-icons/md";

function SupportCategoryChart({ categoryBreakdown, totalTickets }) {
  if (Object.entries(categoryBreakdown).length > 0) {
    return (
      <div className="barChartWrapper">
        {Object.entries(categoryBreakdown).map(
          ([category, count]) => {
            const percentage = (
              (count / totalTickets) * 100
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
    );
  }
  return (
    <div className="emptyChart">
      <MdPieChart size={48} />
      <p>No category data available</p>
    </div>
  );
}

export default SupportCategoryChart;
