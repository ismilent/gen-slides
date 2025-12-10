import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  isLoading, 
  className = '', 
  disabled,
  ...props 
}) => {
  // Base style: Softer radius, clean typography
  const baseStyle = "inline-flex items-center justify-center px-5 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-paper-100 disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    // Primary: Dark Charcoal (Ink) background, White text. Classy.
    primary: "bg-ink hover:bg-black text-white shadow-md shadow-gray-200 border border-transparent",
    
    // Secondary: White/Cream background, Stone border, Ink text.
    secondary: "bg-white hover:bg-paper-200 text-ink border border-paper-300 shadow-sm",
    
    // Ghost: Transparent, Ink text.
    ghost: "bg-transparent hover:bg-paper-200 text-ink-light hover:text-ink",
    
    // Danger: Soft Red.
    danger: "bg-red-50 hover:bg-red-100 text-red-700 border border-red-200"
  };

  return (
    <button 
      className={`${baseStyle} ${variants[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          思考中...
        </span>
      ) : children}
    </button>
  );
};