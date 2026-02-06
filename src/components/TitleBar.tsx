interface TitleBarProps {}

function TitleBar(_props: TitleBarProps) {
  const handleMinimize = () => {
    if (window.electronAPI) {
      window.electronAPI.windowMinimize();
    }
  };

  const handleClose = () => {
    if (window.electronAPI) {
      window.electronAPI.windowClose();
    }
  };

  return (
    <div className="title-bar">
      <div className="title-bar-title">
        <svg 
          className="title-bar-icon" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="1.5"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v12M6 12h12" />
        </svg>
        <span className="title-bar-text">MathFormer</span>
      </div>
      
      <div className="title-bar-controls">
        <button 
          className="title-bar-btn minimize" 
          onClick={handleMinimize}
          aria-label="Minimize window"
        />
        <button 
          className="title-bar-btn close" 
          onClick={handleClose}
          aria-label="Close window"
        />
      </div>
    </div>
  );
}

export default TitleBar;
