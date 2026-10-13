<?php
/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * @var \OCP\IL10N $l
 */
?>
<div class="section plantuml-test">
	<button type="button" id="plantuml-test-btn" class="button"><?php p($l->t('Test connection')); ?></button>
	<p id="plantuml-test-result" class="plantuml-test__result" hidden>
		<svg class="plantuml-test__icon plantuml-test__icon--success" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
			<path fill="currentColor" d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z"/>
		</svg>
		<svg class="plantuml-test__icon plantuml-test__icon--error" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
			<path fill="currentColor" d="M13,13H11V7H13M13,17H11V15H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z"/>
		</svg>
		<span id="plantuml-test-message"></span>
	</p>
</div>
