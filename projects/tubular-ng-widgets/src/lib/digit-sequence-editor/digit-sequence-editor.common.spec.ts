import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { Type } from '@angular/core';
import { DigitSequenceEditorDirective } from './digit-sequence-editor.directive';
import { getCSSProperty, sendTestClick, sendTestKey } from '../../test/test-utils';

function dseItemSort(a: Element, b: Element): number {
  const av = parseInt(a.getAttribute('data-name').substring(9));
  const bv = parseInt(b.getAttribute('data-name').substring(9));

  return av - bv;
}

type DigitSequenceSuperclass = DigitSequenceEditorDirective<any>;

export class CommonTestEnvironment<T, U extends DigitSequenceSuperclass> {
  fixture: ComponentFixture<T>;
  component: T;
  editor: U;
  element: HTMLElement;
  stateIndicator: HTMLElement;
  statusBackground: string;
  errorObserver: MutationObserver;
  digits: HTMLElement[];
  upArrow: HTMLElement;
  downArrow: HTMLElement;
  errorColor: string;
  warningColor: string;

  constructor() {
    this.errorColor = getCSSProperty('tbw-error-background', 'background-color');
    this.warningColor = getCSSProperty('tbw-warning-background', 'background-color');
  }

  collectDigits(): void {
    this.digits = Array.from(this.element.querySelectorAll('[data-name^="dse-item-"]'))
      .sort((a, b) => dseItemSort(a, b)) as unknown as HTMLElement[];
    this.upArrow = this.element.querySelector('[data-name="up"]') as HTMLElement;
    this.downArrow = this.element.querySelector('[data-name="down"]') as unknown as HTMLElement;
  }

  async paste(text: string): Promise<void> {
    this.editor.doPaste(text);
    this.fixture.detectChanges();
    await this.fixture.whenStable();
  }

  byCss(selector: string): HTMLElement {
    return this.fixture.debugElement.query(By.css(selector))?.nativeElement;
  }

  readDisplayedText(): string {
    this.collectDigits();
    return this.digits.map(d => d.textContent?.trim() || '').join('');
  }

  async sendKey(key: string, duration?: number): Promise<void> {
    return sendTestKey(key, this.element, this.fixture, duration);
  }

  async clickDigit(index: number, duration?: number): Promise<void> {
    if (index < 0)
      index = this.digits.length + index;

    return sendTestClick(this.digits[index], this.fixture, duration);
  }

  async clickElement(element: HTMLElement, duration?: number): Promise<void> {
    return sendTestClick(element, this.fixture, duration);
  }

  detectChanges(): void {
    this.fixture.detectChanges();
  }

  whenStable(): Promise<void> {
    return this.fixture.whenStable();
  }
}

export async function sharedBeforeEach<T, U extends DigitSequenceSuperclass>(qlass: Type<T>, innerClass: Type<U>,
                                          selector: string, initValue: string): Promise<CommonTestEnvironment<T, U>> {
  await TestBed.configureTestingModule({
    providers: [provideAnimations()]
  }).compileComponents();

  const cte = new CommonTestEnvironment<T, U>;

  cte.fixture = TestBed.createComponent(qlass);
  cte.component = cte.fixture.componentInstance;
  cte.editor = (cte.component as any).inner;
  cte.element = cte.byCss(selector);
  cte.stateIndicator = cte.byCss('.tbw-dse-state-indicator');
  await cte.paste(initValue);

  cte.errorObserver = new MutationObserver(() => {
    if (cte.stateIndicator.style.backgroundColor)
      cte.statusBackground = cte.stateIndicator.style.backgroundColor;
  });

  cte.errorObserver.observe(cte.stateIndicator, { attributes: true, attributeFilter: ['style', 'class'] });
  cte.statusBackground = '';
  spyOn((innerClass as any).prototype, 'errorFlash').and.callThrough();
  spyOn((innerClass as any).prototype, 'warningFlash').and.callThrough();

  cte.collectDigits();
  cte.element.focus();

  return cte;
}
