#!/usr/bin/env python3
"""
MathFormer Calculator Backend
Uses neural network-based arithmetic via the mathformer library.
"""

import sys
import json
import mathformer


def calculate(operation: str, a: str, b: str) -> str:
    """
    Perform calculation using MathFormer's neural network.
    
    Args:
        operation: One of 'add', 'sub', 'mul', 'div'
        a: First operand (as string)
        b: Second operand (as string)
    
    Returns:
        Result as string
    """
    try:
        # Convert string inputs to numbers
        num_a = float(a) if '.' in a else int(a)
        num_b = float(b) if '.' in b else int(b)
        
        # For mathformer, we need integers
        int_a = int(num_a)
        int_b = int(num_b)
        
        if operation == 'add':
            result = mathformer.add(int_a, int_b)
        elif operation == 'sub':
            result = mathformer.sub(int_a, int_b)
        elif operation == 'mul':
            result = mathformer.mul(int_a, int_b)
        elif operation == 'div':
            if int_b == 0:
                return "Error: Division by zero"
            result = mathformer.div(int_a, int_b)
        else:
            return f"Error: Unknown operation '{operation}'"
        
        return str(result)
        
    except Exception as e:
        return f"Error: {str(e)}"


def main():
    """
    Main entry point for CLI usage.
    Usage: python calculator.py <operation> <a> <b>
    """
    if len(sys.argv) != 4:
        print("Usage: python calculator.py <operation> <a> <b>")
        print("Operations: add, sub, mul, div")
        sys.exit(1)
    
    operation = sys.argv[1]
    a = sys.argv[2]
    b = sys.argv[3]
    
    result = calculate(operation, a, b)
    print(result)


if __name__ == "__main__":
    main()
