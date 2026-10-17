<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Integration\Steps;

/**
 * A linked file open in the editor, drawn before it is saved: the source as
 * stored, with the linked file's new text sent beside it.
 */
trait LinkedFileSteps {
	private const STYLED = "@startuml\n<style file=Styled.css>\nAlice -> Bob : StyledMarker\n@enduml\n";
	private const OLD_STYLE = "arrow {\n  LineColor #000000\n}\n";
	private const NEW_STYLE = "arrow {\n  LineColor #12AB34\n}\n";
	private const GHOST = "@startuml\nlegend\n!include Absent.puml\nendlegend\n@enduml\n";

	/** @Given I have a diagram that takes its style from a file beside it */
	public function iHaveADiagramThatTakesItsStyleFromAFileBesideIt(): void {
		$this->diagramPath = 'Diagrams/Styled.puml';
		$this->putFile('Diagrams', 'Styled.puml', self::STYLED);
		$this->putFile('Diagrams', 'Styled.css', self::OLD_STYLE);
	}

	/** @When the diagram is drawn with new text for that style file */
	public function theDiagramIsDrawnWithNewTextForThatStyleFile(): void {
		$this->renderResponse = $this->renderWith(self::STYLED, '/' . $this->diagramPath, ['Styled.css' => self::NEW_STYLE]);
	}

	/** @Then the drawing uses the new text */
	public function theDrawingUsesTheNewText(): void {
		$response = $this->lastRenderResponse();
		$this->assertSvg($response, 'StyledMarker');
		if (stripos((string)$response->getBody(), '#12AB34') === false) {
			throw new \RuntimeException('the drawing does not use the new LineColor #12AB34');
		}
	}

	/** @Then the style file is unchanged */
	public function theStyleFileIsUnchanged(): void {
		$this->assertFileHolds('Diagrams/Styled.css', self::OLD_STYLE);
	}

	/** @Given I have a diagram that includes a file beside it that does not exist */
	public function iHaveADiagramThatIncludesAFileBesideItThatDoesNotExist(): void {
		$this->diagramPath = 'Diagrams/Ghost.puml';
		$this->putFile('Diagrams', 'Ghost.puml', self::GHOST);
	}

	/** @When the diagram is drawn with text for that missing file */
	public function theDiagramIsDrawnWithTextForThatMissingFile(): void {
		$this->renderResponse = $this->renderWith(self::GHOST, '/' . $this->diagramPath, ['Absent.puml' => "Ghost\n"]);
	}

	/** @Then the drawing names the include as one it cannot find */
	public function theDrawingNamesTheIncludeAsOneItCannotFind(): void {
		// The include is GHOST's third line.
		$this->assertMistake('Cannot find Absent.puml', 2);
	}
}
