export const AddIcon = ({ 
  color = 'currentColor', 
  width = 24, 
  height, 
  className = '', 
  ...props 
}) => {
  return (
    <svg
      width={width}
      height={height || width} // Defaults to square unless explicit height is passed
      viewBox="0 0 309.059 309.059"
      version="1.1"
      xmlns="http://www.w3.org/2000/svg"
      xmlSpace="preserve"
      className={className}
      {...props}
    >
      <g>
        <g>
          <path
            fill={color}
            d="M280.71,126.181h-97.822V28.338C182.889,12.711,170.172,0,154.529,0S126.17,12.711,126.17,28.338
            v97.843H28.359C12.722,126.181,0,138.903,0,154.529c0,15.621,12.717,28.338,28.359,28.338h97.811v97.843
            c0,15.632,12.711,28.348,28.359,28.348c15.643,0,28.359-12.717,28.359-28.348v-97.843h97.822
            c15.632,0,28.348-12.717,28.348-28.338C309.059,138.903,296.342,126.181,280.71,126.181z"
          />
        </g>
      </g>
    </svg>
  );
};
