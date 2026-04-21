export class ValueObjectError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ValueObjectError"
  }
}

export class LengthError extends ValueObjectError {
  constructor(message: string) {
    super(message)
    this.name = "LengthError"
  }
}

export class AreaError extends ValueObjectError {
  constructor(message: string) {
    super(message)
    this.name = "AreaError"
  }
}

export class MoneyError extends ValueObjectError {
  constructor(message: string) {
    super(message)
    this.name = "MoneyError"
  }
}

export class PricePerAreaError extends ValueObjectError {
  constructor(message: string) {
    super(message)
    this.name = "PricePerAreaError"
  }
}

export class PercentageError extends ValueObjectError {
  constructor(message: string) {
    super(message)
    this.name = "PercentageError"
  }
}
