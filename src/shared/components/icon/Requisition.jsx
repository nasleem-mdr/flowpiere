export const RequisitionIcon = ({ size = 24, color = 'currentColor', ...props }) => {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 6.35 6.35"
        xmlSpace="preserve"
        {...props}
      >
        {/* Elemen Dekorasi / Stempel Kecil di Kiri Bawah */}
        <rect
          id="rect16"
          width={0.474}
          height={1.246}
          x={-0.305}
          y={4.854}
          ry={0.027}
          style={{
            fill: color,
            stroke: 'none',
          }}
          transform="matrix(.98666 -.16281 .1194 .99285 0 0)"
        />
  
        {/* Bagian Bawah / Aksen Dokumen */}
        <path
          id="path16"
          d="m1.008 4.885.117.954c.53-.328 1.616-.168 2.426-.1.181.015.35.012.504-.061.724-.346 1.275-.739 1.87-1.063.05-.174-.085-.374-.371-.31l-.415.147-.233.093-.194.038c-.093.032-.06.016-.162.045.006.673-.528.76-1.745.477.044-.038.147-.052.244-.07.257-.044.544.006.783.015.096.003.225.015.333-.079.08-.069.091-.216.083-.256-.019-.086-.046-.095-.094-.143a.7.7 0 0 0-.302-.134c-.373-.059-.511.043-.928-.074-.129-.036-.247-.053-.345-.081-.254-.073-.397-.068-.67.126a3.4 3.4 0 0 1-.901.476"
          style={{
            fill: color,
            stroke: color,
            strokeWidth: 0.064583,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            strokeDasharray: 'none',
          }}
        />
  
        {/* Sisi Kanan Kotak/Berkas (Perspektif 3D) */}
        <rect
          id="rect27"
          width={1.93}
          height={1.954}
          x={1.942}
          y={0.525}
          ry={0.077}
          style={{
            fill: 'none',
            stroke: color,
            strokeWidth: 0.168351,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            strokeDasharray: 'none',
          }}
          transform="scale(.90526 1) skewY(23.018)"
        />
  
        {/* Sisi Kiri Kotak/Berkas (Perspektif 3D) */}
        <rect
          id="rect1"
          width={1.93}
          height={1.954}
          x={-5.843}
          y={3.82}
          ry={0.077}
          style={{
            fill: 'none',
            stroke: color,
            strokeWidth: 0.168351,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            strokeDasharray: 'none',
          }}
          transform="scale(-.90526 1) skewY(23.018)"
        />
  
        {/* Bagian Atas / Lipatan Dokumen */}
        <path
          id="path2"
          d="M2.011 1.242s1.295.626 1.494.584 1.644-.678 1.644-.678L3.69.804Z"
          style={{
            fill: 'none',
            stroke: color,
            strokeWidth: 0.145878,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            strokeDasharray: 'none',
          }}
        />
      </svg>
    );
  };
  