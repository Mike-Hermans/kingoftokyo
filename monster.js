Class monster {
	var max_hp;
	var hp;
	var vp;
	var ep;
	var powerups = [];
	var isInTokyo;
	var counters = [];

	constructor("Name") {
		this.max_hp = 10;
		this.hp = this.max_hp;
		this.vp = 0;
		this.ep = 0;
		this.isInTokyo = false;
	}

	public function startTurn() {

	}

	public function doDamage(damage) {
		// Check if we have any cards to boost our attack

	}

	public function getDamage(damage, type = null) {
		
		// Check for type, like poison
		if (type !== null) {

		}
	}

	public function heal() {

	}
}