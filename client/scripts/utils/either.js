/**
 * Either monad implementation
 * represents computations that might fail
 */

class Either {
	static left(value) {
		return new Left(value);
	}

	static right(value) {
		return new Right(value);
	}

	static of(value) {
		return Either.right(value);
	}

	static tryCatch(fn) {
		try {
			return Either.right(fn());
		} catch (e) {
			return Either.left(e);
		}
	}
}

class Left extends Either {
	constructor(value) {
		super();
		this._value = value;
	}

	map() {
		return this;
	}

	chain() {
		return this;
	}

	fold(leftFn) {
		return leftFn(this._value);
	}

	getOrElse(defaultValue) {
		return defaultValue;
	}

	isLeft() {
		return true;
	}

	isRight() {
		return false;
	}
}

class Right extends Either {
	constructor(value) {
		super();
		this._value = value;
	}

	map(fn) {
		return Either.of(fn(this._value));
	}

	chain(fn) {
		return fn(this._value);
	}

	fold(_, rightFn) {
		return rightFn(this._value);
	}

	getOrElse() {
		return this._value;
	}

	isLeft() {
		return false;
	}

	isRight() {
		return true;
	}
}

export default Either;
