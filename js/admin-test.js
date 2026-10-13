/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The Test connection button. The endpoint always answers {success, message};
 * the message is the line to show, the flag picks its icon.
 */
(function () {
	'use strict';

	function init() {
		var btn = document.getElementById('plantuml-test-btn');
		var result = document.getElementById('plantuml-test-result');
		var message = document.getElementById('plantuml-test-message');
		if (!btn || !result || !message || btn.dataset.bound === '1') {
			return;
		}
		btn.dataset.bound = '1';

		function show(success, text) {
			result.classList.toggle('plantuml-test__result--success', success);
			result.classList.toggle('plantuml-test__result--error', !success);
			message.textContent = text;
			result.hidden = false;
		}

		btn.addEventListener('click', function () {
			btn.disabled = true;
			result.hidden = true;

			fetch(OC.generateUrl('/apps/plantuml/test-connection'), {
				method: 'POST',
				headers: {
					'requesttoken': OC.requestToken,
					'Accept': 'application/json',
				},
			})
				.then(function (res) { return res.json(); })
				.then(function (data) { show(data.success === true, data.message); })
				.catch(function (err) { show(false, err.message); })
				.finally(function () { btn.disabled = false; });
		});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
