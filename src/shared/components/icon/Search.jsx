
export const SearchIcon = ({ 
  size = 48, 
  color1 = "#64B5F6", // Warna ketiak / kaca pembesar bagian dalam
  color2 = "#37474F", // Warna gagang / detail bingkai
  ...props 
}) => {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      x="0px" 
      y="0px" 
      width={size} 
      height={size} 
      viewBox="0 0 48 48"
      {...props}
    >
      {/* Batang / Gagang Luar */}
      <path 
        fill="#616161" 
        d="M34.6 28.1H38.6V45.1H34.6z" 
        transform="rotate(-45.001 36.586 36.587)"
      />
      {/* Bingkai Lingkaran Luar */}
      <path 
        fill="#616161" 
        d="M20 4A16 16 0 1 0 20 36A16 16 0 1 0 20 4Z"
      />
      {/* Ujung Gagang - Menggunakan color2 */}
      <path 
        fill={color2} 
        d="M36.2 32.1H40.2V44.400000000000006H36.2z" 
        transform="rotate(-45.001 38.24 38.24)"
      />
      {/* Lingkaran Kaca / Lensa - Menggunakan color1 */}
      <path 
        fill={color1} 
        d="M20 7A13 13 0 1 0 20 33A13 13 0 1 0 20 7Z"
      />
      {/* Pantulan Cahaya Kaca */}
      <path 
        fill="#BBDEFB" 
        d="M26.9,14.2c-1.7-2-4.2-3.2-6.9-3.2s-5.2,1.2-6.9,3.2c-0.4,0.4-0.3,1.1,0.1,1.4c0.4,0.4,1.1,0.3,1.4-0.1C16,13.9,17.9,13,20,13s4,0.9,5.4,2.5c0.2,0.2,0.5,0.4,0.8,0.4c0.2,0,0.5-0.1,0.6-0.2C27.2,15.3,27.2,14.6,26.9,14.2z"
      />
    </svg>
  );
};
export const SearchIcon2 = ({ size = 18 }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" strokeLinecap="round" 
    strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);
