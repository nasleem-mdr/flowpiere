export const ListIcon = ({ size = 24, teks = R, className = '', ...props }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      fill="none"
      viewBox="0 0 24 24"
      className={className}
      {...props}
    >
      {/* Tanda Centang / Checkmark */}
      <path
        id="path1"
        stroke="currentColor"
        d="m14.628 16.187 2.481 2.954 4.609-5.908"
        style={{
          strokeWidth: 1.65425,
          strokeDasharray: 'none',
        }}
      />
      
      {/* Garis Bawah Kiri */}
      <path
        id="path3"
        stroke="currentColor"
        d="M9.901 18.55h-8.27"
        style={{
          strokeWidth: 1.65425,
          strokeDasharray: 'none',
        }}
      />
      
      {/* Garis Atas */}
      <path
        id="path4"
        stroke="currentColor"
        d="M1.63 4.371h12.778m7.91 0h-2.739"
        style={{
          strokeWidth: 1.67875,
          strokeDasharray: 'none',
        }}
      />
      
      {/* Garis Pendek Tengah-Bawah */}
      <path
        id="path6"
        d="M1.63 13.824h2.645"
        style={{
          fill: 'currentColor',
          fillOpacity: 1,
          stroke: 'currentColor',
          strokeWidth: 1.65425,
          strokeLinecap: 'butt',
          strokeLinejoin: 'round',
          strokeDasharray: 'none',
          strokeOpacity: 1,
        }}
      />
      
      {/* Garis Pendek Tengah-Atas */}
      <path
        id="path7"
        d="M1.63 9.098h2.645"
        style={{
          fill: 'currentColor',
          fillOpacity: 1,
          stroke: 'currentColor',
          strokeWidth: 1.65425,
          strokeLinecap: 'butt',
          strokeLinejoin: 'round',
          strokeDasharray: 'none',
          strokeOpacity: 1,
        }}
      />
      
      {/* Garis Panjang Tengah-Kanan */}
      <path
        id="path8"
        d="M12.512 9.098h9.806"
        style={{
          fill: 'currentColor',
          fillOpacity: 1,
          stroke: 'currentColor',
          strokeWidth: 1.70732,
          strokeLinecap: 'butt',
          strokeLinejoin: 'round',
          strokeDasharray: 'none',
          strokeOpacity: 1,
        }}
      />
      
      {/* Karakter "R" */}
      <text
        xmlSpace="preserve"
        id="text8"
        x="3.821"
        y="16.295"
        style={{
          fontWeight: 700,
          fontSize: '15.702px',
          fontFamily: 'Calibri, sans-serif',
          textAlign: 'start',
          letterSpacing: '0.0642354px',
          writingMode: 'lr-tb',
          direction: 'ltr',
          textAnchor: 'start',
          fill: 'currentColor',
          stroke: 'none',
          strokeWidth: 1.53187,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          strokeDasharray: 'none',
        }}
      >
        <tspan
          id="tspan8"
          x="3.821"
          y="16.295"
          style={{
            fontStyle: 'normal',
            fontVariant: 'normal',
            fontWeight: 700,
            fontStretch: 'normal',
            fontFamily: 'Calibri, sans-serif',
            fill: 'currentColor',
            stroke: 'none',
            strokeWidth: 1.53187,
            strokeDasharray: 'none',
          }}
        >
          {teks}
        </tspan>
      </text>
      
      {/* Elemen Atas Kanan (Grup) */}
      <g
        id="path9"
        style={{
          strokeWidth: 1.4,
          strokeDasharray: 'none',
        }}
        transform="matrix(1.1816 0 0 1.7356 -1.915 -10.474)"
      >
        <path
          id="path10"
          d="M11.959 14h2.238"
          style={{
            fill: 'currentColor',
            strokeWidth: 1.4,
            strokeLinejoin: 'round',
            strokeDasharray: 'none',
          }}
        />
        <path
          id="path11"
          d="m11.959 13.523.4.954h1.838v-.954z"
          style={{
            color: 'currentColor',
            fontStyle: 'normal',
            fontVariant: 'normal',
            fontWeight: 400,
            fontStretch: 'normal',
            fontSize: 'medium',
            lineHeight: 'normal',
            fontFamily: 'sans-serif',
            textIndent: 0,
            textAlign: 'start',
            textDecorationLine: 'none',
            textDecorationStyle: 'solid',
            letterSpacing: 'normal',
            wordSpacing: 'normal',
            textTransform: 'none',
            writingMode: 'lr-tb',
            direction: 'ltr',
            textOrientation: 'mixed',
            dominantBaseline: 'auto',
            baselineShift: 'baseline',
            textAnchor: 'start',
            whiteSpace: 'normal',
            clipRule: 'nonzero',
            display: 'inline',
            overflow: 'visible',
            visibility: 'visible',
            isolation: 'auto',
            mixBlendMode: 'normal',
            fill: 'currentColor',
            fillOpacity: 1,
            fillRule: 'nonzero',
            stroke: 'none',
            strokeWidth: 1.4,
            strokeLinecap: 'butt',
            strokeLinejoin: 'round',
            strokeMiterlimit: 4,
            strokeDasharray: 'none',
            strokeDashoffset: 0,
            strokeOpacity: 1,
            stopColor: 'currentColor',
          }}
        />
      </g>
    </svg>
  );
};
