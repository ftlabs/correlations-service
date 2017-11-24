'use strict';

const INSTANCES = [];

class SimpleCache {
	constructor(){
		INSTANCES.push( this );
		return this.flush();
	}

	flush() {
		this.STORE = {};
		return 0;
	}

	makeKeyString( keyObj ){
		return JSON.stringify(keyObj);
	}

	read(keyObj) {
		const key = this.makeKeyString(keyObj);
		return this.STORE[key];
	}

	write(keyObj, payload){
		const key = this.makeKeyString(keyObj);
		this.STORE[key] = payload;
		return true;
	}

	static flushAll(){
		INSTANCES.forEach( instance => { instance.flush(); })
	}
}

module.exports = SimpleCache;
