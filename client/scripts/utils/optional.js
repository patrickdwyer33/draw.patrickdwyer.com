/**
 * Optional/Maybe type implementation
 * handles nullable values safely
 */

class Optional {
	static some(value) {
		return new Some(value);
	}

	static none() {
		return new None();
	}

	static of(value) {
		return value == null ? Optional.none() : Optional.some(value);
	}
}

class Some extends Optional {
	constructor(value) {
		super();
		this._value = value;
	}

	map(fn) {
		return Optional.of(fn(this._value));
	}

	chain(fn) {
		return fn(this._value);
	}

	getOrElse() {
		return this._value;
	}

	filter(predicate) {
		return predicate(this._value) ? this : Optional.none();
	}

	isSome() {
		return true;
	}

	isNone() {
		return false;
	}
}

class None extends Optional {
	map() {
		return this;
	}

	chain() {
		return this;
	}

	getOrElse(defaultValue) {
		return defaultValue;
	}

	filter() {
		return this;
	}

	isSome() {
		return false;
	}

	isNone() {
		return true;
	}
}

export default Optional;
