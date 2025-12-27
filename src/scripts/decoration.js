document.addEventListener('DOMContentLoaded', function() {
    const container = document.getElementById('ornamentsContainer');
    const ornamentTypes = ['ornament-0', 'ornament-1', 'ornament-2', 'ornament-3'];
    const ornamentCount = window.innerWidth > 768 ? 50 : 15;

    function random(min, max) {
        return Math.random() * (max - min) + min;
    }

    const segmentWidth = 100 / ornamentCount;

    for (let i = 0; i < ornamentCount; i++) {
        const ornament = document.createElement('div');
        ornament.className = 'ornament gentle-swing';

        const ornamentType = ornamentTypes[Math.floor(Math.random() * ornamentTypes.length)];
        ornament.classList.add(ornamentType);

        const size = window.innerWidth > 768
            ? random(40, 75)
            : random(28, 48);
        ornament.style.width = `${size}px`;
        ornament.style.height = `${size}px`;

        const segmentStart = i * segmentWidth;
        const segmentEnd = (i + 1) * segmentWidth;
        ornament.style.left = `${random(segmentStart, segmentEnd)}%`;

        const layer = Math.floor(i % 3);
        let topPosition;

        if (layer === 0) {
            topPosition = random(25, 25);
        } else if (layer === 1) {
            topPosition = random(50, 50);
        } else {
            topPosition = random(75, 80);
        }

        ornament.style.top = `${topPosition}px`;
        ornament.style.pointerEvents = 'auto';

        ornament.addEventListener('mouseenter', function() {
            this.classList.remove('swinging', 'gentle-swing');
            void this.offsetWidth;
            this.classList.add('swinging');
            this.addEventListener('animationend', function handleAnimationEnd(e) {
                if (e.animationName === 'swingWithDamping') {
                    this.classList.remove('swinging');
                    this.classList.add('gentle-swing');
                    this.removeEventListener('animationend', handleAnimationEnd);
                }
            });
        });

        const layerType = i % 2 === 0 ? 'behind' : 'front';

        if (layerType === 'behind') {
            ornament.style.zIndex = 2;
        } else {
            ornament.style.zIndex = 5;
        }
        container.appendChild(ornament);
    }
});