const statusColors = {
  'Open': '#FFA500',
  'Closed': '#4CAF50',
  'In Progress': '#2196F3',
  'Pending': '#FFC107',
  'Resolved': '#8BC34A'
};

function StatusPieChart({ statusData, totalTickets }) {
  if (totalTickets === 0) {
    return <p className="emptyMessage">No tickets available</p>;
  }

  const pieSlices = [];

  let cumulativePercent = 0;

  Object.entries(statusData).forEach(([status, count]) => {

    const percent = (count / totalTickets) * 100;

    const startAngle = cumulativePercent * 3.6;

    const endAngle = (cumulativePercent + percent) * 3.6;

    cumulativePercent += percent;

    const startX = 50 + 40 * Math.cos((startAngle - 90) * Math.PI / 180);
    //fixing angle offset so it like 12 instead of 3
    const startY = 50 + 40 * Math.sin((startAngle - 90) * Math.PI / 180);

    const endX = 50 + 40 * Math.cos((endAngle - 90) * Math.PI / 180);

    const endY = 50 + 40 * Math.sin((endAngle - 90) * Math.PI / 180);

    let largeArc;
    if (percent > 50) {
      largeArc = 1;
    }
    else {
      largeArc = 0;
    }

    let fillColor;
    if (statusColors[status]) {
      fillColor = statusColors[status];
    }
    else {
      fillColor = '#94a3b8';
    }

    pieSlices.push(
      <path
        key={status}
        d={`M 50 50 L ${startX} ${startY} A 40 40 0 ${largeArc} 1 ${endX} ${endY} Z`}
        fill={fillColor}
      />
    );
  });

  const legendItems = [];
  Object.entries(statusData).forEach(([status, count]) => {
    const percentage = ((count / totalTickets) * 100).toFixed(1);

    let legendColor;
    if (statusColors[status]) {
      legendColor = statusColors[status];
    } else {
      legendColor = '#94a3b8';
    }

    legendItems.push(
      <div key={status} className="legendItem">

        <span className="legendColor" style={
          {
            backgroundColor: legendColor
          }}>
        </span>

        <span className="legendLabel">
          {status}
        </span>

        <span className="legendValue">
          {count} ({percentage}%)
        </span>

      </div>
    );
  });

  return (
    <>
      <div className="pieChart">

        <svg viewBox="0 0 100 100" className="pieChartSvg">
          {pieSlices}
        </svg>
      </div>

      <div className="pieLegend">
        {legendItems}
      </div>
    </>
  );
}

export default StatusPieChart;
