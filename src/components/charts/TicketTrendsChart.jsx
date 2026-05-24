function TicketTrendsChart({ tickets, tooltip, setTooltip }) {
  const getTicketTrendsData = () => {
    const trendsData = [];
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);

      const dateString = date.toISOString().split('T')[0];

      let count = 0;
      tickets.forEach(ticket => {
        const ticketDate = new Date(ticket.created_at).toISOString().split('T')[0];
        if (ticketDate === dateString) {
          count = count + 1;
        }
      });

      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });

      trendsData.push({
        day: dayName,
        date: dateString,
        count: count
      });
    }

    return trendsData;
  };

  const trendsData = getTicketTrendsData();

  if (tickets.length === 0) {
    return <p className="emptyMessage">No trend data available</p>;
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

  const chartWidth = 280;
  const chartHeight = 150;
  const padding = 30;
  const pointsArray = [];

  trendsData.forEach((item, index) => {
    const x = padding + (index * ((chartWidth - padding * 2) / (trendsData.length - 1)));
    const y = chartHeight - padding - ((item.count / maxCount) * (chartHeight - padding * 2));
    pointsArray.push(`${x},${y}`);
  });

  const pointsString = pointsArray.join(' ');

  const dataPoints = [];
  trendsData.forEach((item, index) => {
    const x = padding + (index * ((chartWidth - padding * 2) / (trendsData.length - 1)));
    const y = chartHeight - padding - ((item.count / maxCount) * (chartHeight - padding * 2));

    const handleMouseEnter = () => {
      let tooltipX = x;
      if (x < 60) {
        tooltipX = 60;
      }
      if (x > chartWidth - 60) {
        tooltipX = chartWidth - 60;
      }

      let tooltipY;
      if (y < 50) {
        tooltipY = y + 50;
      } else {
        tooltipY = y - 10;
      }

      setTooltip({
        show: true,
        x: tooltipX,
        y: tooltipY,
        day: item.day,
        date: item.date,
        count: item.count
      });
    };

    const handleMouseLeave = () => {
      setTooltip({
        show: false,
        x: 0,
        y: 0,
        day: '',
        date: '',
        count: 0
      });
    };

    dataPoints.push(
      <circle
        key={index}
        cx={x}
        cy={y}
        r="6"
        fill="#0D9488"
        className="dataPoint"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ cursor: 'pointer' }}
      />
    );
  });

  const xLabels = [];
  trendsData.forEach((item, index) => {
    const x = padding + (index * ((chartWidth - padding * 2) / (trendsData.length - 1)));

    xLabels.push(
      <text
        key={index}
        x={x}
        y={chartHeight - 8}
        textAnchor="middle"
        fontSize="10"
        fill="#64748b"
      >
        {item.day}
      </text>
    );
  });

  const yLabels = [];
  for (let i = 0; i <= 4; i++) {
    const value = Math.round((maxCount / 4) * i);
    const y = chartHeight - padding - ((i / 4) * (chartHeight - padding * 2));

    yLabels.push(
      <text
        key={i}
        x="10"
        y={y + 4}
        fontSize="10"
        fill="#64748b"
      >
        {value}
      </text>
    );
  }

  return (
    <div className="lineChartWrapper">
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="lineChartSvg">

        <line x1={padding} y1={padding} x2={padding} y2={chartHeight - padding} stroke="#e2e8f0" strokeWidth="1" />
        <line x1={padding} y1={chartHeight - padding} x2={chartWidth - padding} y2={chartHeight - padding} stroke="#e2e8f0" strokeWidth="1" />

        {yLabels}
        {xLabels}

        <polyline
          points={pointsString}
          fill="none"
          stroke="#0D9488"
          strokeWidth="2"
          className="trendLine"
        />

        {dataPoints}

        {tooltip.show && (
          <g>
            <rect
              x={tooltip.x - 40}
              y={tooltip.y - 32}
              width="80"
              height="30"
              rx="4"
              fill="#1e293b"
              className="tooltipBox"
            />
            <text
              x={tooltip.x}
              y={tooltip.y - 18}
              textAnchor="middle"
              fontSize="11"
              fontWeight="bold"
              fill="#ffffff"
            >
              {tooltip.count} ticket{tooltip.count !== 1 ? 's' : ''}
            </text>
            <text
              x={tooltip.x}
              y={tooltip.y - 6}
              textAnchor="middle"
              fontSize="9"
              fill="#94a3b8"
            >
              {tooltip.date}
            </text>
          </g>
        )}
      </svg>

      <div className="trendSummary">
        <p>Last 7 days ticket activity - Hover over points for details</p>
      </div>
    </div>
  );
}

export default TicketTrendsChart;
