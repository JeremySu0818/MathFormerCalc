import { useState, useCallback, useEffect } from 'react';
import TitleBar from './components/TitleBar';
import Display from './components/Display';
import Keypad from './components/Keypad';

type Operation = 'add' | 'sub' | 'mul' | 'div' | null;

interface CalculatorState {
  displayValue: string;
  previousValue: string | null;
  operation: Operation;
  waitingForOperand: boolean;
  expression: string;
  isLoading: boolean;
  error: string | null;
}

const initialState: CalculatorState = {
  displayValue: '0',
  previousValue: null,
  operation: null,
  waitingForOperand: false,
  expression: '',
  isLoading: false,
  error: null,
};

function App() {
  const [state, setState] = useState<CalculatorState>(initialState);
  const [isBackendReady, setIsBackendReady] = useState<boolean>(true);
  const [isInstalling, setIsInstalling] = useState<boolean>(false);
  const [installLogs, setInstallLogs] = useState<string[]>([]);

  // Check backend status on mount
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.checkBackendStatus().then((ready) => {
        setIsBackendReady(ready);
      });

      window.electronAPI.onBackendLog((log) => {
        setInstallLogs(prev => [...prev.slice(-50), log]);
      });
    }
  }, []);

  const handleInstallBackend = async () => {
    if (!window.electronAPI) return;
    setIsInstalling(true);
    try {
      await window.electronAPI.installBackend();
      setIsBackendReady(true);
    } catch (err) {
      alert("Installation failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsInstalling(false);
    }
  };

  const inputDigit = useCallback((digit: string) => {
    setState(prev => {
      if (prev.waitingForOperand) {
        return {
          ...prev,
          displayValue: digit,
          waitingForOperand: false,
          error: null,
        };
      }

      const newValue = prev.displayValue === '0' ? digit : prev.displayValue + digit;

      // Limit display length
      if (newValue.length > 15) return prev;

      return {
        ...prev,
        displayValue: newValue,
        error: null,
      };
    });
  }, []);

  const inputDecimal = useCallback(() => {
    setState(prev => {
      if (prev.waitingForOperand) {
        return {
          ...prev,
          displayValue: '0.',
          waitingForOperand: false,
          error: null,
        };
      }

      if (prev.displayValue.includes('.')) return prev;

      return {
        ...prev,
        displayValue: prev.displayValue + '.',
        error: null,
      };
    });
  }, []);

  const clearAll = useCallback(() => {
    setState(initialState);
  }, []);

  const clearEntry = useCallback(() => {
    setState(prev => ({
      ...prev,
      displayValue: '0',
      error: null,
    }));
  }, []);

  const toggleSign = useCallback(() => {
    setState(prev => ({
      ...prev,
      displayValue: prev.displayValue.startsWith('-')
        ? prev.displayValue.slice(1)
        : '-' + prev.displayValue,
    }));
  }, []);

  const performOperation = useCallback(async (nextOperation: Operation) => {
    setState(prev => {
      const value = prev.displayValue;

      if (prev.previousValue === null) {
        // First operand
        const opSymbol = getOperationSymbol(nextOperation);
        return {
          ...prev,
          previousValue: value,
          operation: nextOperation,
          waitingForOperand: true,
          expression: `${value} ${opSymbol}`,
        };
      }

      return prev;
    });

    // If we have a previous operation, calculate first
    if (state.previousValue !== null && state.operation && !state.waitingForOperand) {
      await calculate(state.operation, state.previousValue, state.displayValue, nextOperation);
    } else if (state.previousValue !== null && nextOperation) {
      // Just update the operation
      setState(prev => ({
        ...prev,
        operation: nextOperation,
        expression: `${prev.previousValue} ${getOperationSymbol(nextOperation)}`,
        waitingForOperand: true,
      }));
    }
  }, [state.previousValue, state.operation, state.displayValue, state.waitingForOperand]);

  const calculate = async (
    op: Operation,
    prevValue: string,
    currValue: string,
    nextOp?: Operation
  ) => {
    if (!op) return;

    setState(prev => ({
      ...prev,
      isLoading: true,
      expression: `${prevValue} ${getOperationSymbol(op)} ${currValue} =`,
    }));

    try {
      let result: string;

      // Check if electronAPI is available (running in Electron)
      if (window.electronAPI) {
        result = await window.electronAPI.calculate(op, prevValue, currValue);
      } else {
        // Fallback for browser development
        result = calculateLocally(op, prevValue, currValue);
      }

      if (result.startsWith('Error')) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: result,
          displayValue: 'Error',
        }));
        return;
      }

      setState(prev => {
        if (nextOp) {
          return {
            ...prev,
            displayValue: result,
            previousValue: result,
            operation: nextOp,
            waitingForOperand: true,
            isLoading: false,
            expression: `${result} ${getOperationSymbol(nextOp)}`,
            error: null,
          };
        }

        return {
          ...prev,
          displayValue: result,
          previousValue: null,
          operation: null,
          waitingForOperand: true,
          isLoading: false,
          error: null,
        };
      });
    } catch (err) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Calculation failed',
        displayValue: 'Error',
      }));
    }
  };

  const handleEquals = useCallback(async () => {
    if (state.operation && state.previousValue !== null && !state.waitingForOperand) {
      await calculate(state.operation, state.previousValue, state.displayValue);
    }
  }, [state.operation, state.previousValue, state.displayValue, state.waitingForOperand]);

  const handleBackspace = useCallback(() => {
    setState(prev => {
      if (prev.displayValue.length === 1 ||
        (prev.displayValue.length === 2 && prev.displayValue.startsWith('-'))) {
        return { ...prev, displayValue: '0' };
      }
      return { ...prev, displayValue: prev.displayValue.slice(0, -1) };
    });
  }, []);

  // Keyboard support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        inputDigit(e.key);
      } else if (e.key === '.') {
        inputDecimal();
      } else if (e.key === '+') {
        performOperation('add');
      } else if (e.key === '-') {
        performOperation('sub');
      } else if (e.key === '*') {
        performOperation('mul');
      } else if (e.key === '/') {
        e.preventDefault();
        performOperation('div');
      } else if (e.key === 'Enter' || e.key === '=') {
        handleEquals();
      } else if (e.key === 'Escape') {
        clearAll();
      } else if (e.key === 'Backspace') {
        handleBackspace();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inputDigit, inputDecimal, performOperation, handleEquals, clearAll, handleBackspace]);

  return (
    <div className="app">
      <div className="app-background">
        <div className="app-overlay" />
      </div>

      <TitleBar />

      <div className="calculator">
        <Display
          value={state.displayValue}
          expression={state.expression}
          isLoading={state.isLoading}
          error={state.error}
        />

        <Keypad
          onDigit={inputDigit}
          onDecimal={inputDecimal}
          onOperation={performOperation}
          onEquals={handleEquals}
          onClear={clearAll}
          onClearEntry={clearEntry}
          onToggleSign={toggleSign}
          onBackspace={handleBackspace}
          activeOperation={state.operation}
          isLoading={state.isLoading}
        />

        <div className="status-bar">
          <span className={`status-indicator ${state.isLoading ? 'loading' : ''} ${state.error ? 'error' : ''}`} />
          <span className="status-text">
            {state.isLoading ? 'Neural Computing...' : 'MathFormer Ready'}
          </span>
        </div>
      </div>

      {!isBackendReady && (
        <div className="setup-overlay">
          <div className="setup-card">
            <div className="setup-title">Backend Required</div>
            <div className="setup-desc">
              MathFormer requires a local Python environment with neural network libraries.
            </div>

            {isInstalling && (
              <div className="setup-progress">
                <div className="setup-progress-bar" />
              </div>
            )}

            <button
              className="setup-btn"
              onClick={handleInstallBackend}
              disabled={isInstalling}
            >
              {isInstalling ? "Installing..." : "Initialize Engine"}
            </button>

            {installLogs.length > 0 && (
              <div className="setup-logs">
                {installLogs.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function getOperationSymbol(op: Operation): string {
  switch (op) {
    case 'add': return '+';
    case 'sub': return '-';
    case 'mul': return '×';
    case 'div': return '÷';
    default: return '';
  }
}

function calculateLocally(op: string, a: string, b: string): string {
  const numA = parseFloat(a);
  const numB = parseFloat(b);

  switch (op) {
    case 'add': return String(numA + numB);
    case 'sub': return String(numA - numB);
    case 'mul': return String(numA * numB);
    case 'div': return numB === 0 ? 'Error: Division by zero' : String(numA / numB);
    default: return 'Error';
  }
}

export default App;
