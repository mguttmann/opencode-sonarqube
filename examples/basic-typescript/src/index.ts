/**
 * Example TypeScript file with intentional code quality issues
 * Run `sonarqube({ action: "analyze" })` to detect these issues!
 */

// Issue: Unused variable (typescript:S1481)
const unusedVar = "This variable is never used";

// Issue: Magic numbers (typescript:S109)
function calculatePrice(quantity: number): number {
  return quantity * 19.99 + 5.99; // Magic numbers: 19.99 and 5.99
}

// Issue: High cognitive complexity (typescript:S3776)
function complexFunction(input: number): string {
  let result = "";
  
  if (input > 0) {
    if (input < 10) {
      if (input % 2 === 0) {
        result = "small even";
      } else {
        result = "small odd";
      }
    } else if (input < 100) {
      if (input % 2 === 0) {
        result = "medium even";
      } else {
        result = "medium odd";
      }
    } else {
      if (input % 2 === 0) {
        result = "large even";
      } else {
        result = "large odd";
      }
    }
  } else if (input < 0) {
    if (input > -10) {
      result = "small negative";
    } else if (input > -100) {
      result = "medium negative";
    } else {
      result = "large negative";
    }
  } else {
    result = "zero";
  }
  
  return result;
}

// Issue: Duplicate code block (copy of complexFunction logic)
function categorizeNumber(num: number): string {
  let category = "";
  
  if (num > 0) {
    if (num < 10) {
      if (num % 2 === 0) {
        category = "small even";
      } else {
        category = "small odd";
      }
    } else if (num < 100) {
      if (num % 2 === 0) {
        category = "medium even";
      } else {
        category = "medium odd";
      }
    } else {
      if (num % 2 === 0) {
        category = "large even";
      } else {
        category = "large odd";
      }
    }
  } else if (num < 0) {
    if (num > -10) {
      category = "small negative";
    } else if (num > -100) {
      category = "medium negative";
    } else {
      category = "large negative";
    }
  } else {
    category = "zero";
  }
  
  return category;
}

// Good code - no issues
export function greet(name: string): string {
  return `Hello, ${name}!`;
}

export function add(a: number, b: number): number {
  return a + b;
}

// Main entry point
console.log(greet("World"));
console.log(`Price: $${calculatePrice(3)}`);
console.log(`Category: ${complexFunction(42)}`);
console.log(`Number type: ${categorizeNumber(42)}`);
