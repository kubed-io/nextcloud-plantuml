<?php

/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\PlantUml\Tests\Unit;

use OCA\PlantUml\Service\TemplateLibrary;
use OCA\PlantUml\Settings\TemplateSettings;
use OCP\IGroupManager;
use OCP\IUser;
use OCP\IUserSession;
use OCP\Settings\DeclarativeSettingsTypes;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

final class TemplateSettingsTest extends TestCase {
	/** @param array{actor: ?string, templates: int, files: int} $summary */
	private function settings(array $summary = ['actor' => 'admin', 'templates' => 12, 'files' => 4], ?TemplateLibrary $library = null, ?LoggerInterface $logger = null, bool $admin = true): TemplateSettings {
		if ($library === null) {
			$library = $this->createStub(TemplateLibrary::class);
			$library->method('summary')->willReturn($summary);
			$library->method('folder')->willReturn('Templates');
		}
		$user = $this->createStub(IUser::class);
		$user->method('getUID')->willReturn($admin ? 'admin' : 'drk');
		$session = $this->createStub(IUserSession::class);
		$session->method('getUser')->willReturn($user);
		$groups = $this->createStub(IGroupManager::class);
		$groups->method('isAdmin')->willReturnCallback(static fn (string $uid): bool => $uid === 'admin');
		return new TemplateSettings($library, $session, $groups, $logger ?? $this->createStub(LoggerInterface::class));
	}

	public function testTheSchemaIsTheTemplatesCard(): void {
		$schema = $this->settings()->getSchema();
		self::assertSame('templates', $schema['id']);
		// Below AdminTest's Test connection button (10): core sorts declarative and classic settings together.
		self::assertSame(20, $schema['priority']);
		self::assertSame('plantuml', $schema['section_id']);
		self::assertSame(DeclarativeSettingsTypes::SECTION_TYPE_ADMIN, $schema['section_type']);
		self::assertSame(DeclarativeSettingsTypes::STORAGE_TYPE_EXTERNAL, $schema['storage_type']);
		self::assertSame('Templates', $schema['title']);
		self::assertSame('Diagrams everyone can start from, in Add diagram', $schema['description']);
		self::assertCount(1, $schema['fields']);
		self::assertSame('template_folder', $schema['fields'][0]['id']);
		self::assertSame('Template folder', $schema['fields'][0]['title']);
		self::assertSame(DeclarativeSettingsTypes::TEXT, $schema['fields'][0]['type']);
		self::assertSame('Templates', $schema['fields'][0]['default']);
	}

	public function testTheStatusLineCountsTemplatesAndFiles(): void {
		self::assertSame("In admin's files · 12 templates in 4 files", $this->settings()->getSchema()['fields'][0]['description']);
	}

	public function testOneTemplateInOneFileIsSingular(): void {
		self::assertSame("In admin's files · 1 template in 1 file", $this->settings(['actor' => 'admin', 'templates' => 1, 'files' => 1])->getSchema()['fields'][0]['description']);
	}

	public function testNoActorMeansNoStatusLine(): void {
		self::assertArrayNotHasKey('description', $this->settings(['actor' => null, 'templates' => 0, 'files' => 0])->getSchema()['fields'][0]);
	}

	/** Core builds every form's schema on every settings page, for every user. */
	public function testANonAdminsSchemaReadsNoFile(): void {
		$library = $this->createMock(TemplateLibrary::class);
		$library->expects(self::never())->method('summary');
		$library->expects(self::never())->method('ensureFolder');
		$library->expects(self::never())->method('files');
		$schema = $this->settings(library: $library, admin: false)->getSchema();
		self::assertArrayNotHasKey('description', $schema['fields'][0]);
	}

	public function testTheFolderIsReadOncePerPage(): void {
		$library = $this->createMock(TemplateLibrary::class);
		$library->expects(self::once())->method('summary')->willReturn(['actor' => 'admin', 'templates' => 1, 'files' => 1]);
		$settings = $this->settings(library: $library);
		$settings->getSchema();
		$settings->getSchema();
	}

	public function testTheFieldReadsTheFolder(): void {
		self::assertSame('Templates', $this->settings()->getValue('template_folder', $this->createStub(IUser::class)));
	}

	public function testSavingTheFolderGoesToTheLibrary(): void {
		$library = $this->createMock(TemplateLibrary::class);
		$library->expects(self::once())->method('setFolder')->with('Diagrams/Templates');
		$this->settings(library: $library)->setValue('template_folder', 'Diagrams/Templates', $this->createStub(IUser::class));
	}

	public function testARefusedFolderIsLoggedAndRethrown(): void {
		$library = $this->createStub(TemplateLibrary::class);
		$library->method('setFolder')->willThrowException(new \InvalidArgumentException("Template folder must be a folder in the actor's files"));
		$logger = $this->createMock(LoggerInterface::class);
		$logger->expects(self::once())->method('info')->with('Template folder refused: {reason}', self::anything());
		$this->expectException(\InvalidArgumentException::class);
		$this->settings(library: $library, logger: $logger)->setValue('template_folder', '../x', $this->createStub(IUser::class));
	}
}
