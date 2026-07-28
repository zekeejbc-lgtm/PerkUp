export const getCustomerGroupMapPinVisual = (count: number) => {
  const fontSize = count >= 100 ? 12 : count >= 10 ? 15 : 18;

  return {
    html: `
      <svg
        data-customer-map-pin="group"
        width="48"
        height="56"
        viewBox="0 0 48 56"
        aria-hidden="true"
        style="display:block;overflow:visible;filter:drop-shadow(0 5px 7px rgba(0,0,0,.24));"
      >
        <path
          d="M24 1.5C11.57 1.5 1.5 11.57 1.5 24c0 15.22 18.47 28.4 22.5 31 4.03-2.6 22.5-15.78 22.5-31C46.5 11.57 36.43 1.5 24 1.5Z"
          fill="#1b1b1b"
          stroke="#ffffff"
          stroke-width="2"
          stroke-linejoin="round"
        />
        <text
          x="24"
          y="23.5"
          fill="#ffffff"
          font-family="system-ui, sans-serif"
          font-size="${fontSize}"
          font-weight="800"
          text-anchor="middle"
          dominant-baseline="middle"
        >${count}</text>
      </svg>
    `,
    iconSize: [48, 56] as [number, number],
    iconAnchor: [24, 55] as [number, number],
    popupAnchor: [0, -52] as [number, number],
  };
};
