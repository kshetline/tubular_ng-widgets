import { animate, state, style, transition, trigger } from '@angular/animations';
import {
  AfterViewInit, ChangeDetectorRef, Directive, ElementRef, EventEmitter, Input, NgZone, OnDestroy, OnInit, Output, ViewChild
} from '@angular/core';
import { abs, floor, max, min, Point, random, round, sign } from '@tubular/math';
import {
  eventToKey, getCssRuleValue, getCssValue, htmlEscape, isAndroid, isChrome, isChromeOS, isEdge, isEqual, isIOS,
  isNumber, isSamsung, isString, noop, processMillis, toBoolean, toNumber
} from '@tubular/util';
import { Subscription, timer } from 'rxjs';
import { getClientXYForTouchEvent, getPageXYForTouchEvent } from '../util/touch-events';
import { AbstractControl, ControlValueAccessor, Validator } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

export interface SequenceItemInfo {
  alt_swipeAbove?: string;
  alt_swipeBelow?: string;
  alt_value?: string;
  bidi?: boolean;
  deltaY?: number;
  digit?: true;
  divider?: boolean;
  editable?: boolean;
  fade?: boolean;
  format?: string;
  hidden?: boolean;
  index?: number;
  indicator?: boolean;
  maxChars?: number;
  monospaced?: boolean;
  name?: string;
  selected?: boolean;
  sign?: boolean;
  sizer?: string;
  spinner?: boolean;
  static?: boolean;
  swipeAbove?: string;
  swipeBelow?: string;
  value?: string | number;
  width?: string;
}

export interface ButtonInfo {
  html?: string | SafeHtml;
  key: string;
  label?: string;
}

export const FORWARD_TAB_DELAY = 250;

const FALSE_REPEAT_THRESHOLD = 50;
const KEY_REPEAT_DELAY = 500;
const KEY_REPEAT_RATE  = 100;
const FLASH_DURATION = 250;
const LONG_WARNING_DURATION = 2000;

const DIGIT_SWIPE_THRESHOLD = 6;
const LOSE_FOCUS_DELAY = 500;
const MAX_DIGIT_SWIPE = 0.9;
const MIN_DIGIT_SWIPE = 0.33;
const MIN_SWIPE_TIME = 200;
const SWIPE_SMOOTHING_WINDOW = 500;

const NO_SELECTION = -1;
const SPIN_UP      = -2;
const SPIN_DOWN    = -3;

const alternateClipboard = navigator.clipboard == null || isAndroid() || isChromeOS() || isIOS() || isSamsung();
const checkForRepeatedKeyTimestamps = isIOS();
const disableContentEditable = isEdge();
const useHiddenInput = isAndroid() || isChromeOS();

function getBackgroundColor(className: string, defaultColor: string, darkMode = false): string {
  const outer = document.createElement('div');
  const elem = document.createElement('div');

  if (darkMode)
    outer.classList.add('tbw-dark-mode');

  document.body.appendChild(outer);
  elem.classList.add(className);
  outer.appendChild(elem);
  let result = getCssRuleValue(elem, 'background-color');
  document.body.removeChild(outer);

  if (result === 'transparent' || result === 'rgba(0, 0, 0, 0)')
    result = defaultColor;

  return result;
}

function getBackgroundLevel(elem: HTMLElement): number {
  if (!elem)
    return 255;

  const color = getCssValue(elem, 'background-color');

  if (color === 'transparent')
    return elem.parentElement ? getBackgroundLevel(elem.parentElement) : 255;

  const [r, g, b, a] = (/(\d+)\b.*?\b(\d+).*?\b(\d+)(?:.*?\b(\d+))?/.exec(color) ?? [0, 0, 0, 0, 0])
    .map(n => toNumber(n, 255)).slice(1);

  if (a === 0)
    return elem.parentElement ? getBackgroundLevel(elem.parentElement) : 255;

  let level = r * 0.21 + g * 0.72 + b * 0.07;

  if (a != null && a !== 255 && elem.parentElement)
    level = (a * level + (255 - a) * getBackgroundLevel(elem.parentElement)) / 255;

  return level;
}

const CONFIRM_BACKGROUND   = 'tbw-confirm-background';
const DISABLED_ARROW_COLOR = 'tbw-disabled-arrow-color';
const DISABLED_BACKGROUND  = 'tbw-disabled-background';
const DISABLED_TEXT        = 'tbw-disabled-text';
const ERROR_BACKGROUND     = 'tbw-error-background';
const INDICATOR_TEXT       = 'tbw-indicator-text';
const NORMAL_BACKGROUND    = 'tbw-normal-background';
const NORMAL_TEXT          = 'tbw-normal-text';
// const SELECTED_BACKGROUND  = 'tbw-selected-background';
const SELECTED_TEXT        = 'tbw-selected-text';
const SPINNER_FILL         = 'tbw-spinner-fill';
const VIEW_ONLY_TEXT       = 'tbw-view-only-text';
const VIEW_ONLY_BACKGROUND = 'tbw-view-only-background';
const WARNING_BACKGROUND   = 'tbw-warning-background';

const DOT_DOT_TYPING_INTERVAL = 500;

class DynamicColor {
  private static colorMap: Record<string, string> = {};

  static update(key: string, darkMode = false): void {
    DynamicColor.colorMap[key] = getBackgroundColor(key, DynamicColor.colorMap[key], darkMode);
  }

  constructor(private key: string, defaultColor: string) {
    DynamicColor.colorMap[key] = defaultColor;
  }

  toString(): string {
    return DynamicColor.colorMap[this.key];
  }
}

export const BACKGROUND_ANIMATIONS = trigger('displayState', [
  state('error',     style({ backgroundColor: new DynamicColor(ERROR_BACKGROUND, '#F67') as unknown as string })),
  state('normal',    style({ backgroundColor: 'transparent' })),
  state('refresh',   style({ backgroundColor: 'rgba(0, 0, 0, 0.01)' })),
  state('confirm',   style({ backgroundColor: new DynamicColor(CONFIRM_BACKGROUND, '#6C6') as unknown as string })),
  state('warning',   style({ backgroundColor: new DynamicColor(WARNING_BACKGROUND, '#FC6') as unknown as string })),
  transition('normal => error',   animate(FLASH_DURATION)),
  transition('error => normal',   animate(FLASH_DURATION)),
  transition('normal => confirm', animate(FLASH_DURATION)),
  transition('confirm => normal', animate(FLASH_DURATION)),
  transition('warning => error',  animate(FLASH_DURATION)),
  transition('error => warning',  animate(FLASH_DURATION)),
]);

export function getThePoint(evt: MouseEvent | TouchEvent): Point {
  if ((evt as any).pageX != null)
    return { x: (evt as any).pageX, y: (evt as any).pageY };
  else {
    return getPageXYForTouchEvent(evt as any);
  }
}

export function isNilOrBlank(v: any): boolean {
  return v == null || v === '';
}

let This: typeof DigitSequenceEditorDirective;

// @dynamic
@Directive()
export abstract class DigitSequenceEditorDirective<T> implements
    AfterViewInit, ControlValueAccessor, OnInit, OnDestroy, Validator {
  // Template accessibility

  disableContentEditable = disableContentEditable;
  htmlEscape = htmlEscape;
  SPIN_DOWN = SPIN_DOWN;
  SPIN_UP = SPIN_UP;

  // ControlValueAccessor/Validator-related fields

  private afterViewInit = false;
  private pendingValueChange = false;

  protected changed = noop;
  protected _disabled = false;
  protected _fakeUrl = false;
  protected lastValue: T = null;
  protected touched = noop;
  protected valid = true;
  protected _validateAll = false;
  protected _value: T = null;
  protected _wideSpinner = false;

  @Output() private valueChange = new EventEmitter<T>();

  // DigitSequenceEditorDirective specifics

  private static defaultCursorRate: string | null = null;
  private static headerStartX = 0;
  private static headerStartY = 0;
  private static instances = new Set<DigitSequenceEditorDirective<any>>();
  private static lastKeyTimestamp = 0;
  private static lastKeyKey = '';
  private static mutationObserver: MutationObserver;
  private static pasteable: DigitSequenceEditorDirective<any>;

  static setDefaultCursorRate(value: number | string | null | undefined): void {
    this.defaultCursorRate = value && isString(value) ? value : (isNumber(value) ? value + 'ms' : null);
  }

  protected static dragStartsActive = false;

  static touchHasOccurred = false;

  private activeSpinner = NO_SELECTION;
  private clickTimer: Subscription;
  private confirmTimer: Subscription;
  private errorTimer: Subscription;
  private firstTouchPoint: Point;
  private focusStretchTimer: any;
  private focusTimer: any;
  private getCharFromInputEvent = false;
  private hasHiddenInputFocus = false;
  private hasWrapperFocus = false;
  private ignoreFocus = 0;
  private initialTouchTime = 0;
  private keyTimer: Subscription;
  private lastDelta = 1;
  private _position: Point = { x: 0, y: 0 };
  private touchDeltaY = 0;
  private touchDeltaYs: number[] = [];
  private touchDeltaTimes: number[] = [];
  private warningTimer: Subscription;

  protected _blank = false;
  protected _cursorRate: string | null = null;
  protected darkMode = false;
  protected emSizer: HTMLElement;
  protected _floating = false;
  protected hiddenInput: HTMLInputElement;
  protected lastDecimalTime = 0;
  protected lastTabTime = 0;
  protected letterDecrement = 'z';
  protected letterIncrement = 'a';
  protected pasteInput: HTMLInputElement;
  protected selectionHidden = false;
  protected _showCloser = false;
  protected showFocus = false;
  protected swipeIndex = -1;
  protected _tabindex = '0';
  protected _viewOnly = false;
  protected wrapper: HTMLElement;

  protected static dragee: DigitSequenceEditorDirective<any>;

  baselineShift = '0';
  buttons: ButtonInfo[] = [];
  // eslint-disable-next-line @angular-eslint/no-output-native
  @Output() close = new EventEmitter<void>();
  digitHeight = 17;
  displayItems: SequenceItemInfo[] = [];
  displayState = 'normal';
  @Input() floatZ = 1;
  hasFocus = false;
  headerDx = 0;
  headerDy = 0;
  headerX = 0;
  headerY = 0;
  items: SequenceItemInfo[] = [];
  lineHeight: string;
  rtl = false;
  selection = 0;
  showPasteInput = false;
  smoothedDeltaY = 0;
  useAlternateTouchHandling = false;

  @ViewChild('emSizer', { static: true }) private emSizerRef: ElementRef;
  @ViewChild('wrapper', { static: true }) private wrapperRef: ElementRef;

  protected constructor(
    protected zone: NgZone,
    protected cdr: ChangeDetectorRef,
    protected sanitizer: DomSanitizer
  ) {
    This.instances.add(this);

    if (!This.mutationObserver) {
      This.mutationObserver = new MutationObserver(mutations => {
        let modeChanged = false;

        for (const mutation of mutations) {
          const wasDark = /\btbw-dark-mode\b/.test(mutation.oldValue || '');
          const isDark = /\btbw-dark-mode\b/.test((mutation.target as HTMLElement)?.className || '');

          if (wasDark !== isDark) {
            modeChanged = true;
            break;
          }
        }

        if (modeChanged)
          setTimeout(() => This.instances.forEach(instance => instance.checkDarkMode(true)));
      });

      This.mutationObserver.observe(document.body,
        { subtree: true, attributeFilter: ['class'], attributeOldValue: true });
    }

    if (This.instances.size === 1) {
      document.addEventListener('mousedown', This.mouseDownOrTouch);
      document.addEventListener('touchstart', This.mouseDownOrTouch);
      document.addEventListener('mouseup', This.headerDragEnd);
      document.addEventListener('touchend', This.headerDragEnd);
      document.addEventListener('touchcancel', This.headerDragEnd);
      window.addEventListener('resize', This.assureAllFullyOnScreen);

      zone.runOutsideAngular(() => {
        document.addEventListener('mousemove', This.headerDrag);
        document.addEventListener('touchmove', This.headerDrag, { passive: false });
      });
    }
  }

  // Angular lifecycle

  ngOnInit(): void {
    this.wrapper = this.wrapperRef.nativeElement;
    this.emSizer = this.emSizerRef.nativeElement;

    this.wrapper.addEventListener('copy', evt => {
      evt.preventDefault();

      const text = this.getClipboardText();

      if (text) {
        evt.clipboardData.setData('text/plain', text);
        this.confirmFlash();
      }
    });

    this.wrapper.addEventListener('paste', evt => {
      evt.preventDefault();
      this.doPaste(evt.clipboardData.getData('text/plain'));
    });

    this.createDigits();
    this.createButtons();
    this.createDisplayOrder();
    this.createHiddenInput();
  }

  ngAfterViewInit(): void {
    this.checkDarkMode();

    setTimeout(() => {
      this.afterViewInit = true;

      if (this.pendingValueChange) {
        this.pendingValueChange = false;
        this.valueHasChanged(true);
      }
    });
  }

  ngOnDestroy(): void {
    this.stopKeyTimer();
    this.stopClickTimer();
    This.instances.delete(this);

    if (This.mutationObserver && This.instances.size === 0) {
      This.mutationObserver.disconnect();
      This.mutationObserver = undefined;
    }

    if (This.instances.size === 0) {
      document.removeEventListener('mousedown', This.mouseDownOrTouch);
      document.removeEventListener('touchstart', This.mouseDownOrTouch);
      document.removeEventListener('mousemove', This.headerDrag);
      document.removeEventListener('touchmove', This.headerDrag);
      document.removeEventListener('mouseup', This.headerDragEnd);
      document.removeEventListener('touchend', This.headerDragEnd);
      document.removeEventListener('touchcancel', This.headerDragEnd);
      window.removeEventListener('resize', This.assureAllFullyOnScreen);
    }
  }

  // ControlValueAccessor interface

  writeValue(obj: any): void {
    this.value = obj;
  }

  registerOnChange(fn: any): void {
    this.changed = fn;
  }

  registerOnTouched(fn: any): void {
    this.touched = fn;
  }

  setDisabledState?(isDisabled: boolean): void {
    this.disabled = isDisabled;
    this.adjustState();
  }

  // ControlValueAccessor support

  get disabled(): boolean | string { return this._disabled; }
  @Input() set disabled(value: boolean | string) {
    if (isString(value))
      value = toBoolean(value, false, true);

    this._disabled = value;
    this.adjustState();
  }

  onBlur(): void {
    this.touched();
  }

  get value(): T {
    return this._value;
  }

  set value(value: T) {
    if (isNilOrBlank(value) && isNilOrBlank(this._value))
      return;

    let forceChange = false;

    if (value === undefined) {
      value = null;
      forceChange = true;
    }

    if (this._value !== value) {
      this._value = value;
      this.valueHasChanged();
    }
    else if (forceChange)
      this.valueHasChanged(true);
  }

  protected valueHasChanged(forceChange = false): void {
    if (forceChange || this.lastValue !== this.value) {
      this.lastValue = this.value;

      if (this.afterViewInit) {
        this.reportValueChange();
        this.valueChange.emit(this.value);
      }
      else
        this.pendingValueChange = true;
    }
  }

  protected reportValueChange(): void {
    this.changed(this.value);
  }

  // Validator interface

  validate(control?: AbstractControl): Record<string, any> {
    const validation = this.validateImpl(this._value, control);
    this.valid = !validation;
    return validation;
  }

  protected validateImpl(_value: T, _control?: AbstractControl): Record<string, any> {
    return null;
  }

  // DigitSequenceEditorDirective specifics

  get cursorRate(): number | string | null | undefined { return this._cursorRate || DigitSequenceEditorDirective.defaultCursorRate; }
  @Input() set cursorRate(value: number | string | null | undefined) {
    this._cursorRate = value && isString(value) ? value : (isNumber(value) ? value + 'ms' : value);
  }

  get blank(): boolean | string { return this._blank; }
  @Input() set blank(newValue: boolean | string) {
    if (isString(newValue))
      newValue = toBoolean(newValue, false, true);

    this._blank = newValue;
  }

  get floating(): boolean | string { return this._floating; }
  @Input() set floating(newValue: boolean | string) {
    if (isString(newValue))
      newValue = toBoolean(newValue, false, true);

    this._floating = newValue;
  }

  get tabindex(): string { return this._tabindex; }
  @Input() set tabindex(newValue: string) {
    if (this._tabindex !== newValue) {
      this._tabindex = newValue;
      this.adjustState();
    }
  }

  get viewOnly(): boolean | string { return this._viewOnly; }
  @Input() set viewOnly(newValue: boolean | string) {
    if (isString(newValue))
      newValue = toBoolean(newValue, false, true);

    this._viewOnly = newValue;
    this.adjustState();
  }

  get inputOff(): boolean { return this._disabled || this._viewOnly || this._floating; }

  get validateAll(): boolean | string { return this._validateAll; }
  @Input() set validateAll(newValue: boolean | string) {
    if (isString(newValue))
      newValue = toBoolean(newValue, false, true);

    if (this._validateAll !== newValue) {
      this._validateAll = newValue;

      if (newValue && !this.valid)
        this.reportValueChange();
    }
  }

  @Output() positionChange = new EventEmitter<Point>();

  get position(): Point { return this._position; };
  @Input() set position(newValue: Point) {
    if (!isEqual(this._position, newValue)) {
      this.headerX = newValue?.x ?? 0;
      this.headerY = newValue?.y ?? 0;
      this._position = { x: this.headerX, y: this.headerY };
      this.positionChange.emit(this._position);
      setTimeout(() => this.assureFullyOnScreen());
    }
  }

  get hasHiddenInput(): boolean { return !!this.hiddenInput; }

  get showCloser(): boolean | string { return this._showCloser; }
  @Input() set showCloser(newValue: boolean | string) {
    if (isString(newValue))
      newValue = toBoolean(newValue, false, true);

    this._showCloser = newValue;
  }

  doCloseAction(): void {
    this.close.emit();
  }

  get fakeUrl(): boolean | string { return this._fakeUrl; }
  @Input() set fakeUrl(newValue: boolean | string) {
    if (isString(newValue))
      newValue = toBoolean(newValue, false, true);

    if (this._fakeUrl !== newValue) {
      this._fakeUrl = newValue;

      if (this.hiddenInput) {
        setTimeout(() => {
          this.hiddenInput.remove();
          this.createHiddenInput();
        });
      }
    }
  }

  get wideSpinner(): boolean | string { return this._wideSpinner; }
  @Input() set wideSpinner(newValue: boolean | string) {
    if (isString(newValue))
      newValue = toBoolean(newValue, false, true);

    this._wideSpinner = newValue;
  }

  protected abstract createDigits(): void;

  protected createButtons(): void {
    this.buttons = [];

    for (let i = 1; i <= 10; ++i)
      this.buttons.push({ key: (i % 10).toString(), label: (i % 10).toString() });

    this.buttons.push({ key: 'Copy', html: this.sanitizer.bypassSecurityTrustHtml(
/* eslint-disable max-len */
`<svg viewBox="0 0 512 512" width="1em" height="1em" style="position: relative; left: 0.05em; top: 0.08em;">
  <g fill="currentColor" style="" transform="matrix(1.307452, 0, 0, 1.307452, -79.275406, -79.4646)">
    <polygon points="304,96 288,96 288,176 368,176 368,160 304,160  "/>
    <path d="M325.3,64H160v48h-48v336h240v-48h48V139L325.3,64z M336,432H128V128h32v272h176V432z M384,384H176V80h142.7l65.3,65.6V384   z"/>
  </g>
</svg>`)});
    this.buttons.push({ key: 'Paste', html: this.sanitizer.bypassSecurityTrustHtml(
`<svg viewBox="0 0 512 512" width="1em" height="1em" style="position: relative; left: 0.02em; top: 0.1em;">
  <g fill="currentColor">
    <g>
      <path d="M160,160h192c-1.7-20-9.7-35.2-27.9-40.1c-0.4-0.1-0.9-0.3-1.3-0.4c-12-3.4-20.8-7.5-20.8-20.7V78.2    c0-25.5-20.5-46.3-46-46.3c-25.5,0-46,20.7-46,46.3v20.6c0,13.1-8.8,17.2-20.8,20.6c-0.4,0.1-0.9,0.4-1.4,0.5    C169.6,124.8,161.9,140,160,160z M256,64.4c7.6,0,13.8,6.2,13.8,13.8c0,7.7-6.2,13.8-13.8,13.8c-7.6,0-13.8-6.2-13.8-13.8    C242.2,70.6,248.4,64.4,256,64.4z"/>
      <path d="M404.6,63H331v14.5c0,10.6,8.7,18.5,19,18.5h37.2c6.7,0,12.1,5.7,12.4,12.5l0.1,327.2c-0.3,6.4-5.3,11.6-11.5,12.1    l-264.4,0.1c-6.2-0.5-11.1-5.7-11.5-12.1l-0.1-327.3c0.3-6.8,5.9-12.5,12.5-12.5H162c10.3,0,19-7.9,19-18.5V63h-73.6    C92.3,63,80,76.1,80,91.6V452c0,15.5,12.3,28,27.4,28H256h148.6c15.1,0,27.4-12.5,27.4-28V91.6C432,76.1,419.7,63,404.6,63z"/>
    </g>
    <rect height="16" width="112" x="144" y="192"/><rect height="16" width="160" x="144" y="288"/>
    <rect height="16" width="129" x="144" y="384"/><rect height="16" width="176" x="144" y="336"/>
    <rect height="16" width="208" x="144" y="240"/>
  </g>
</svg>`)});
/* eslint-enable max-len */
  }

  protected getDigits(index: number, count: number, defaultValue = 0): number {
    if (index < 0)
      return defaultValue;

    let value = 0;

    for (let i = 0; i < count; ++i)
      value = value * 10 + (this.items[index + i].value as number);

    return value;
  }

  protected setDigits(index: number, count: number, value: number, field = 'value'): void {
    if (index < 0)
      return;

    for (let i = count - 1; i >= 0; --i) {
      const digit = value % 10;

      this.items[index + i][field] = floor(digit);
      value = (value - digit) / 10;
    }
  }

  filterDisplayChars(value: number | string): number | string {
    if (isNumber(value))
      return value;
    else
      return value.replace(/\u200F/g, '');
  }

  protected createDisplayOrder(): void {
    this.items.forEach((item, i) => item.index = i);

    if (!this.rtl) {
      this.displayItems = this.items.filter(i => !i.hidden);
      return;
    }

    const deferred: SequenceItemInfo[] = [];
    let ltr = false;

    this.displayItems = [];
    this.items.forEach(item => {
      if (item.hidden)
        return;
      else if (item.digit || item.sign || (ltr && item.bidi)) {
        ltr = true;
        deferred.push(item);
      }
      else {
        ltr = false;
        this.displayItems.push(...deferred.reverse());
        deferred.length = 0;
        this.displayItems.push(item);
      }
    });

    this.displayItems.push(...deferred.reverse());
  }

  protected createHiddenInput(): void {
    if (!useHiddenInput)
      return;

    this.hiddenInput = document.createElement('input');
    this.hiddenInput.name = 'hidden-' + random(0, 99999999);
    this.hiddenInput.inputMode = this.inputOff ? 'none' : this._fakeUrl ? 'url' : 'decimal';
    this.hiddenInput.pattern = this._fakeUrl ? '.*' : '[-+.0-9]*';
    this.hiddenInput.autocomplete = 'new-password';
    this.hiddenInput.setAttribute('autocapitalize', 'off');
    this.hiddenInput.setAttribute('autocomplete', 'off');
    this.hiddenInput.setAttribute('autocorrect', 'off');
    this.hiddenInput.setAttribute('spellcheck', 'false');
    this.hiddenInput.setAttribute('tabindex', this.disabled ? '-1' : this.tabindex);
    this.hiddenInput.style.position = 'absolute';
    this.hiddenInput.style.opacity = '0';
    (this.hiddenInput.style as any)['caret-color'] = 'transparent';
    (this.hiddenInput.style as any)['pointer-events'] = 'none';
    this.hiddenInput.style.left = '0';
    this.hiddenInput.style.top = '-6px';

    this.hiddenInput.addEventListener('keydown', event => this.onKeyDown(event));
    this.hiddenInput.addEventListener('keypress', event => this.onKeyPress(event));
    this.hiddenInput.addEventListener('keyup', () => this.onKeyUp());
    this.hiddenInput.addEventListener('input', () => this.onInput());
    this.hiddenInput.addEventListener('focus', () => this.onHiddenInputFocus(true));
    this.hiddenInput.addEventListener('blur', () => this.onHiddenInputFocus(false));

    this.wrapper.parentElement.appendChild(this.hiddenInput);
    this.wrapper.setAttribute('tabindex', '-1');
    this.prepHiddenInput(false);
  }

  getAlignmentForItem(item: SequenceItemInfo): string {
    return item.digit ? 'center' : 'flex-start';
  }

  getClassForItem(item: SequenceItemInfo): string {
    if (item.monospaced && item.indicator)
      return 'tbw-dse-mono-indicator-font';
    else if (item.indicator)
      return 'tbw-dse-indicator-font';
    else if (item.monospaced)
      return 'tbw-dse-mono-font';
    else
      return null;
  }

  getStyleForItem(item: SequenceItemInfo, heightOffset: number): any {
    const itemStyle: any = {
      top: 'calc(' + (this.swipeable(item, 0) ? (this.smoothedDeltaY + heightOffset) : 0) +
        'px + ' + (item.deltaY || 0) + 'em)'
    };

    if (item.maxChars) {
      let value: string;

      if (heightOffset < 0)
        value = item.alt_swipeAbove || item.swipeAbove;
      else if (heightOffset > 0)
        value = item.alt_swipeBelow || item.swipeBelow;
      else
        value = this.filterDisplayChars(item.alt_value || item.value).toString();

      const ratio = item.maxChars / value.toString().length;

      if (ratio < 1) {
        itemStyle.transform = `scale(${floor(ratio * 100) / 100}, 1)`;
        itemStyle.width = '1px';
      }
    }

    return itemStyle;
  }

  getStaticBackgroundColor(): string {
    if (this._disabled)
      return DISABLED_BACKGROUND;
    else if (this._viewOnly)
      return VIEW_ONLY_BACKGROUND;
    else
      return NORMAL_BACKGROUND;
  }

  isSelected(item?: SequenceItemInfo, index = item?.index): boolean {
    const showFocus = (this.showFocus || !!this.focusStretchTimer);

    return (!this._disabled && showFocus && !this.selectionHidden &&
        ((item && index === this.selection) || (!item && this.activeSpinner === index)));
  }

  getCursorMode(item?: SequenceItemInfo, index = item?.index): string {
    if (!this.isSelected(item, index))
      return '';
    else if (this.cursorRate === '0ms')
      return 'tbw-dse-steady-cursor';
    else
      return 'tbw-dse-blinking-cursor';
  }

  getBackgroundColorForItem(item?: SequenceItemInfo, index = item?.index): string {
    if (this.isSelected(item, index))
      return 'tbw-transparent';
    else if (!this._disabled && !this.viewOnly && (index === SPIN_UP || index === SPIN_DOWN))
      return SPINNER_FILL;
    else
      return 'tbw-transparent';
  }

  getColorForItem(item?: SequenceItemInfo, index = item?.index): string {
    const showFocus = (this.showFocus || !!this.focusStretchTimer);

    if (this._disabled)
      return DISABLED_TEXT;
    else if (item && this._viewOnly)
      return VIEW_ONLY_TEXT;
    else if (this._viewOnly)
      return DISABLED_ARROW_COLOR;
    else if (item && item.indicator)
      return INDICATOR_TEXT;
    else if (index === this.selection && showFocus && !this.selectionHidden)
      return SELECTED_TEXT;
    else
      return NORMAL_TEXT;
  }

  protected canSwipe(item: SequenceItemInfo): boolean {
    return item?.editable && !item.indicator;
  }

  swipeable(item: SequenceItemInfo, delta: number): boolean {
    if (this.swipeIndex < 0)
      return false;

    const nextValue = this.smoothedDeltaY < 0 ? item.swipeBelow : item.swipeAbove;

    return item.index === this.swipeIndex ||
      (sign(delta || this.smoothedDeltaY) === sign(this.smoothedDeltaY) && nextValue != null && item.value !== nextValue);
  }

  createSwipeValues(index: number): void {
    this.roll(1, index, false);
    this.roll(-1, index, false);

    for (let i = 0; i < this.items.length; ++i) {
      const item = this.items[i];

      if (i !== index && !item.divider && !item.static &&
          item.value === item.swipeAbove && item.value === item.swipeBelow)
        item.swipeAbove = item.swipeBelow = null;
    }
  }

  protected roll(_sign: number, _sel = this.selection, _updateValue = true): void {}

  returnFalse(): boolean {
    return false;
  }

  protected confirmFlash(): void {
    if (this.confirmTimer)
      return;

    this.displayState = 'confirm';
    this.confirmTimer = timer(FLASH_DURATION).subscribe(() => {
      this.confirmTimer = undefined;
      this.displayState = 'normal';
    });
  }

  protected warningFlash(longer = false): void {
    if (this.warningTimer)
      return;

    if (!this.errorTimer)
      this.displayState = 'warning';

    this.warningTimer = timer(longer ? LONG_WARNING_DURATION : FLASH_DURATION).subscribe(() => {
      this.warningTimer = undefined;
      this.displayState = (this.errorTimer ? 'error' : 'normal');
    });
  }

  protected errorFlash(): void {
    if (this.errorTimer)
      return;

    this.displayState = 'error';
    this.errorTimer = timer(FLASH_DURATION).subscribe(() => {
      this.errorTimer = undefined;
      this.displayState = (this.warningTimer ? 'warning' : 'normal');
    });
  }

  protected stopKeyTimer(): void {
    if (this.keyTimer) {
      this.keyTimer.unsubscribe();
      this.keyTimer = undefined;
    }
  }

  protected stopClickTimer(): void {
    if (this.clickTimer) {
      this.activeSpinner = NO_SELECTION;
      this.clickTimer.unsubscribe();
      this.clickTimer = undefined;
    }
  }

  onButtonKey(key: string): void {
    this.onButtonFocus();
    this.onKey(key);
  }

  onButtonFocus(): void {
    if (this.focusStretchTimer)
      clearTimeout(this.focusStretchTimer);

    this.focusStretchTimer = setTimeout(() => this.focusStretchTimer = undefined, LOSE_FOCUS_DELAY);
    this.wrapper.focus();
  }

  onMouseDown(index: number, evt?: MouseEvent | TouchEvent): void {
    if (this._disabled || this.viewOnly || ((evt as any)?.button ?? 0) !== 0)
      return;
    else if (evt)
      evt.stopPropagation();

    if (this.items[index]?.spinner && evt?.target) {
      const r = (evt.target as HTMLElement).getBoundingClientRect();

      if (this.wideSpinner) {
        const x = ((evt as any).clientX ?? getClientXYForTouchEvent(evt as any).x);

        if (x < r.left + r.width / 2)
          index = SPIN_UP;
        else
          index = SPIN_DOWN;
      }
      else {
        const y = ((evt as any).clientY ?? getClientXYForTouchEvent(evt as any).y);

        if (y < r.top + r.height / 2)
          index = SPIN_UP;
        else
          index = SPIN_DOWN;
      }
    }

    if (!this.checkSpinAction(index))
      this.updateSelection(index);
  }

  onMouseUp(evt?: MouseEvent): void {
    if (this._disabled || this.viewOnly)
      return;
    else if (evt)
      evt.stopPropagation();

    if (this.clickTimer) {
      this.stopClickTimer();
      this.onSpin(this.lastDelta);
    }
  }

  onMouseLeave(): void {
    this.stopClickTimer();
  }

  headerDragStart(evt: MouseEvent | TouchEvent): void {
    const pt = getThePoint(evt);

    This.dragee = this;
    This.dragStartsActive = document.body.matches(':active');
    this.headerDx = this.headerDy = 0;
    This.headerStartX = pt.x;
    This.headerStartY = pt.y;
    this.wrapper.focus();
    evt.preventDefault();
  }

  static mouseDownOrTouch(evt: MouseEvent | TouchEvent): void {
    if (evt.type === 'touchstart')
      This.touchHasOccurred = true;

    if (This.pasteable?.showPasteInput && evt.target !== This.pasteable.pasteInput) {
      This.pasteable.showPasteInput = false;
      This.pasteable = undefined;
    }
  }

  static headerDrag(evt: MouseEvent | TouchEvent): void {
    if (This.dragStartsActive && !document.body.matches(':active'))
      This.headerDragEnd(evt);
    else if (This.dragee) {
      const pt = getThePoint(evt);

      This.dragee.headerDx = pt.x - This.headerStartX;
      This.dragee.headerDy = pt.y - This.headerStartY;
      This.dragee.assureFullyOnScreen();
      evt.preventDefault();
      This.dragee.cdr.detectChanges();
    }
  }

  static headerDragEnd(evt: MouseEvent | TouchEvent): void {
    if (This.dragee) {
      This.dragee.headerX += This.dragee.headerDx;
      This.dragee.headerY += This.dragee.headerDy;
      This.dragee.headerDx = This.dragee.headerDy = 0;
      This.dragee.assureFullyOnScreen();
      This.dragee.positionChange.emit(This.dragee.position);
      This.dragee = undefined;
      evt.preventDefault();
    }
  }

  static assureAllFullyOnScreen(): void {
    This.instances?.forEach(dse => dse.assureFullyOnScreen());
  }

  protected assureFullyOnScreen(): void {
    if (!this.floating)
      return;

    const r = this.wrapper.parentElement?.getBoundingClientRect();

    if (!r)
      return;

    const x = this.headerX + this.headerDx;
    const y = this.headerY + this.headerDy;
    const winWidth = max(window.innerWidth, document.documentElement.clientWidth);
    const winHeight = min(window.innerHeight, document.documentElement.clientHeight);
    let dx;
    let dy;

    if (x < 0)
      this.headerX -= x;
    else if (r.width < winWidth && (dx = x + r.width - winWidth) > 0)
      this.headerX -= dx;

    if (y < 0)
      this.headerY -= y;
    else if (r.height < winHeight && (dy = y + r.height - winHeight) > 0)
      this.headerY -= dy;

    this.position = { x: this.headerX, y: this.headerY };
  }

  onTouchStart(index: number, evt: TouchEvent): void {
    This.dragStartsActive = document.body.matches(':active');

    if (this._disabled || this.viewOnly)
      return;

    if (evt.cancelable)
      evt.preventDefault();

    if (!this.hasFocus && this.wrapper.focus)
      this.wrapper.focus();

    const target = this.wrapper.querySelector('.dse-item-' + index) as HTMLElement;

    if (target)
      this.digitHeight = target.getBoundingClientRect().height;
    else
      this.digitHeight = round(this.wrapper.getBoundingClientRect().height * 0.734);

    this.clearDeltaYSwiping();
    this.initialTouchTime = processMillis();

    if (this.canSwipe(this.items[index])) {
      this.createSwipeValues(index);
      this.swipeIndex = index;
    }

    if (this.useAlternateTouchHandling)
      this.onTouchStartAlternate(index, evt);
    else
      this.onTouchStartDefault(index, evt);
  }

  onTouchMove(evt: TouchEvent): void {
    if (this._disabled || this.viewOnly)
      return;
    else if (This.dragStartsActive && !document.body.matches(':active')) {
      this.onTouchEnd(evt);
      return;
    }

    if (evt.cancelable) {
      evt.preventDefault();
      evt.stopPropagation();
    }

    if (this.selection >= 0 && this.firstTouchPoint) {
      const pt = getPageXYForTouchEvent(evt);

      this.touchDeltaY = pt.y - this.firstTouchPoint.y;
      this.updateDeltaYSmoothing();
    }
  }

  onTouchEnd(evt: TouchEvent): void {
    const lastDeltaY = this.touchDeltaY;

    if (this._disabled || this.viewOnly)
      return;

    if (evt.cancelable)
      evt.preventDefault();

    this.onMouseUp(null);

    if (this.swipeIndex >= 0 && this.firstTouchPoint) {
      if (abs(lastDeltaY) >= max(this.digitHeight * MIN_DIGIT_SWIPE, DIGIT_SWIPE_THRESHOLD)) {
        if (lastDeltaY > 0) {
          if (this.items[this.selection].swipeAbove != null)
            this.increment();
          else
            this.errorFlash();
        }
        else if (this.items[this.selection].swipeBelow != null)
          this.decrement();
        else
          this.errorFlash();
      }
    }

    if (this.swipeIndex >= 0) {
      this.clearDeltaYSwiping();
    }
  }

  protected onTouchStartDefault(index: number, evt: TouchEvent): void {
    this.firstTouchPoint = getPageXYForTouchEvent(evt);
    this.onMouseDown(index, evt);
  }

  protected onTouchStartAlternate(_index: number, _event: TouchEvent): void {}

  protected updateSelection(newSelection: number): void {
    if (this.selection !== newSelection && this.items[newSelection]?.editable) {
      if (this.selection >= 0)
        this.items[this.selection].selected = false;

      this.selection = newSelection;

      if (this.focusTimer) {
        clearTimeout(this.focusTimer);
        this.focusTimer = undefined;
        this.showFocus = this.hasFocus;
      }

      if (this.selection > 0)
        this.items[this.selection].selected = true;
    }
  }

  private checkSpinAction(index: number): boolean {
    if ((index === SPIN_UP || index === SPIN_DOWN) && !this.clickTimer) {
      this.activeSpinner = index;
      this.lastDelta = (index === SPIN_UP ? 1 : -1);

      this.clickTimer = timer(KEY_REPEAT_DELAY, KEY_REPEAT_RATE).subscribe(() => {
        this.onSpin(this.lastDelta);
      });

      return true;
    }

    return false;
  }

  onFocus(value: boolean, evt: FocusEvent): void {
    if (this.ignoreFocus > 0 || (value && this.viewOnly))
      return;

    if (this.hasWrapperFocus !== value) {
      this.hasWrapperFocus = value;

      if (value) {
        if (this.hiddenInput && !this.hiddenInput.disabled)
          this.hiddenInput.focus();
        else if (isChrome() && evt.relatedTarget !== this.wrapper) {
          // For some reason Chrome (and only Chrome) requires me to play this silly blur/refocus game
          // in order to make clipboard copy work reliably.
          this.blurAndRefocusHack();
        }
      }

      this.checkFocus();
    }
  }

  protected blurAndRefocusHack(): void {
    if (this.ignoreFocus > 0)
      return;

    const elem = this.hiddenInput ?? this.wrapper;

    ++this.ignoreFocus;
    setTimeout(() => {
      elem.blur();
      setTimeout(() => { --this.ignoreFocus; elem.focus(); });
    });
  }

  protected prepHiddenInput(repeatAfterTimeout = true): void {
    if (!this.hiddenInput)
      return;

    this.hiddenInput.value = '››‹‹';
    this.hiddenInput.setSelectionRange(2, 2);

    if (repeatAfterTimeout)
      setTimeout(() => this.prepHiddenInput(false));
  }

  onHiddenInputFocus(value: boolean): void {
    if (value && this.viewOnly)
      return;

    if (this.hasHiddenInputFocus !== value) {
      if (value)
        this.prepHiddenInput();

      this.hasHiddenInputFocus = value;
      this.checkFocus();
    }
  }

  protected hasAComponentInFocus(): boolean {
    return this.hasWrapperFocus || this.hasHiddenInputFocus;
  }

  protected checkFocus(): void {
    const newFocus = this.hasAComponentInFocus();

    if (this.hasFocus !== newFocus) {
      this.hasFocus = newFocus;

      if (this.focusTimer) {
        clearTimeout(this.focusTimer);
        this.focusTimer = undefined;
      }

      if (newFocus) {
        this.focusTimer = setTimeout(() => {
          this.focusTimer = undefined;
          this.showFocus = this.hasFocus;
        }, 250);
        this.gainedFocus();
      }
      else {
        this.showFocus = false;
        this.lostFocus();
      }
    }
  }

  protected gainedFocus(): void {}
  protected lostFocus(): void {}

  onKeyDown(evt: KeyboardEvent): boolean {
    this.prepHiddenInput();

    const key = eventToKey(evt);

    // For some strange reason, iOS external mobile keyboards (at least one Logitech model, and one Apple model)
    // are sometimes generating two keydown events for one single keypress, both events with the same timestamp,
    // very close timestamps, or even a later-arriving event with an earlier timestamp than the first. We need to
    // reject the repeated event.
    //
    // On the other hand, one Android external keyboard I've tested with sends the same timestamp multiple times
    // for legitimately separate keystrokes, so repeated timestamps have to be expected and allowed there.
    //
    if (checkForRepeatedKeyTimestamps &&
        (abs(evt.timeStamp - This.lastKeyTimestamp) <= FALSE_REPEAT_THRESHOLD && key === This.lastKeyKey)) {
      evt.preventDefault();

      return false;
    }

    // With Android many on-screen keyboard key events carry no useful information about the key that was
    // pressed. They instead match the following test and we have to grab a character out of the hidden
    // input field to find out what was actually typed in.
    // noinspection JSDeprecatedSymbols (for `keyCode`)
    if (this.hiddenInput && key === 'Unidentified' && evt.keyCode === 229) {
      this.getCharFromInputEvent = true;
      This.lastKeyTimestamp = evt.timeStamp;

      return true;
    }

    if (/^[xcv]$/i.test(key) && (evt.ctrlKey || evt.metaKey) && !evt.altKey) {
      evt.preventDefault();

      if (key.toLowerCase() === 'v')
        this.doPaste();
      else
        this.doCopy();

      return false;
    }

    if (key === 'Tab')
      this.lastTabTime = performance.now();

    // After this point, most modifiers don't make sense, and no function keys are used.
    if (key === 'Tab' || evt.altKey || evt.ctrlKey || evt.metaKey || /^F\d+$/.test(key))
      return true;

    // If the built-in auto-repeat is in effect, ignore keystrokes that come along until that auto-repeat ends.
    if (!this.keyTimer && key !== 'Shift') {
      this.onKey(key);
      this.keyTimer = timer(KEY_REPEAT_DELAY, KEY_REPEAT_RATE).subscribe(() => this.onKey(key));
    }

    evt.preventDefault();
    This.lastKeyTimestamp = evt.timeStamp;
    This.lastKeyKey = key;

    return false;
  }

  private doPaste(text?: string): void {
    if (text)
      this.applyPastedText(text);
    else if (alternateClipboard) {
      this.showPasteInput = !this.showPasteInput;

      if (this.showPasteInput) {
        This.pasteable = this;
        this.pasteInput = this.wrapper.parentElement.querySelector('input[name="paste-input"]');

        if (this.pasteInput) {
          this.pasteInput.value = '';
          this.pasteInput.focus();
          setTimeout(() => this.pasteInput.focus());
        }
      }
      else
        This.pasteable = undefined;
    }
    else if (navigator.clipboard)
      navigator.clipboard.readText().then(txt => this.applyPastedText(txt));
    else
      this.errorFlash();
  }

  onPasteInput(): void {
    this.pasteInput = this.wrapper.parentElement.querySelector('input[name="paste-input"]');

    if (this.pasteInput?.value)
      this.applyPastedText(this.pasteInput.value);

    this.onPasteBlur();
  }

  onPasteBlur(): void {
    setTimeout(() => {
      this.showPasteInput = false;
      This.pasteable = undefined;
      this.wrapper.focus();

      if (this.pasteInput)
        this.pasteInput.value = '';
    });
  }

  protected applyPastedText(_text: string): void {
    // Default implementation does nothing.
  }

  private doCopy(): void {
    const text = this.getClipboardText();

    if (text) {
      if (alternateClipboard) {
        const elem = document.createElement('input');

        elem.setAttribute('style', 'position: absolute; opacity: 0');
        elem.setAttribute('inputmode', 'none');
        this.wrapper.appendChild(elem);
        elem.value = text;
        elem.select();
        document.execCommand('copy');
        setTimeout(() => {
          this.wrapper.removeChild(elem);
          this.wrapper.focus();
        });
      }
      else if (navigator.clipboard)
        navigator.clipboard.writeText(text).finally(noop);
      else
        this.errorFlash();

      this.confirmFlash();
    }
  }

  protected getClipboardText(): string {
    // Default implementation does nothing.
    return null;
  }

  onKeyUp(): boolean {
    this.stopKeyTimer();

    return true;
  }

  onKeyPress(evt: KeyboardEvent): boolean {
    this.prepHiddenInput();

    const key = eventToKey(evt);

    if (key === 'Tab')
      this.lastTabTime = performance.now();

    if (key === 'Tab' || evt.altKey || evt.ctrlKey || evt.metaKey || /^F\d+$/.test(key))
      return true;

    evt.preventDefault();

    return key === 'Backspace' || key === 'Delete';
  }

  onInput(): void {
    if (this.getCharFromInputEvent) {
      const currInput = this.hiddenInput.value?.replace(/[›‹]/g, '');

      if (currInput && currInput.length > 0)
        this.onKey(currInput.charAt(0));
    }
  }

  onKey(key: string): void {
    if (this._disabled || this.viewOnly || (!this.hasFocus && !this.floating) || !this.items[this.selection]?.editable)
      return;

    let advance = false;

    if (key === '-' || key.toLowerCase() === this.letterDecrement)
      key = 'ArrowDown';
    else if (key === '+' || key === '=' || key.toLowerCase() === this.letterIncrement)
      key = 'ArrowUp';
    else if (key === '0' && isString(this.items[this.selection].value)) {
      key = 'ArrowUp';
      advance = true;
    }

    const now = processMillis();

    switch (key) {
      case 'ArrowUp':
        this.increment();
        break;

      case 'ArrowDown':
        this.decrement();
        break;

      case 'Backspace':
        this.cursorBackward();
        break;

      case 'ArrowLeft':
        this.cursorLeft();
        break;

      case 'ArrowRight':
        this.cursorRight();
        break;

      case 'Copy': // Pseudo key
        this.doCopy();
        break;

      case 'Paste': // Pseudo key
        this.doPaste();
        break;

      case '.':
      case ',':
        if (now < this.lastDecimalTime + DOT_DOT_TYPING_INTERVAL)
          this.cursorForward(); // Otherwise, quietly ignore.

        this.lastDecimalTime = now;
        break;

      case ' ':
      case '*':
      case '#':
      case 'Enter':
      case 'Return':
        this.cursorForward();
        break;

      default:
        if (key && key.length === 1) {
          this.restartCursorAnimation();
          this.digitTyped(key.charCodeAt(0), key);
        }
    }

    if (advance)
      this.cursorForward();
  }

  protected onSpin(delta: number): void {
    if (this._disabled || this.viewOnly)
      return;

    if (delta > 0)
      this.increment();
    else if (delta < 0)
      this.decrement();
  }

  protected cursorLeft(checkRtl = true): void {
    if (checkRtl && this.rtl) {
      this.cursorRight(false);
      return;
    }

    this.cursorBackward(this.displayItems);
  }

  protected cursorRight(checkRtl = true): void {
    if (checkRtl && this.rtl) {
      this.cursorLeft(false);
      return;
    }

    this.cursorForward(this.displayItems);
  }

  protected cursorBackward(items = this.items): void {
    let newSelection = NO_SELECTION;
    const selection = items.findIndex(i => i.index === this.selection);
    const start = (selection >= 0 ? selection : items.length);

    for (let i = start - 1; i >= 0; --i) {
      if (items[i].editable && !items[i].hidden) {
        newSelection = items[i].index;
        break;
      }
    }

    this.setSelection(newSelection);
  }

  protected cursorForward(items = this.items): void {
    let newSelection = -1;
    const selection = items.findIndex(i => i.index === this.selection);
    const start = (selection >= 0 ? selection : -1);

    for (let i = start + 1; i < items.length; ++i) {
      if (items[i].editable && !items[i].hidden) {
        newSelection = items[i].index;
        break;
      }
    }

    this.setSelection(newSelection);
  }

  protected setSelection(newSelection: number): void {
    if (newSelection >= 0) {
      if (this.selection >= 0)
        this.items[this.selection].selected = false;

      this.selection = newSelection;
      this.items[this.selection].selected = true;
    }
  }

  protected restartCursorAnimation(): void {
    const cursor = this.wrapper.querySelector('.tbw-dse-blinker') as HTMLElement;

    if (cursor) {
      cursor.style.animation = 'none';
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions, chai-friendly/no-unused-expressions
      cursor.offsetHeight; /* trigger reflow */
      cursor.style.animation = null;
    }
  }

  protected increment(): void {
    this.restartCursorAnimation();
    this.roll(1);
  }

  protected decrement(): void {
    this.restartCursorAnimation();
    this.roll(-1);
  }

  protected digitTyped(charCode: number, _key: string): void {
    if (48 <= charCode && charCode < 58) {
      this.items[this.selection].value = charCode - 48;
      this.cursorForward();
    }
  }

  protected checkDarkMode(_immediate = false): void {
    const lastMode = this.darkMode;

    this.darkMode = (getBackgroundLevel(this.wrapper?.parentElement) < 128);

    if (this.darkMode !== lastMode) {
      DynamicColor.update(ERROR_BACKGROUND, this.darkMode);
      DynamicColor.update(CONFIRM_BACKGROUND, this.darkMode);
      DynamicColor.update(WARNING_BACKGROUND, this.darkMode);

      const currentState = this.displayState;

      setTimeout(() => {
        this.displayState = 'refresh';
        setTimeout(() => this.displayState = currentState);
      });
    }
  }

  protected adjustState(): void {
    if (this.hiddenInput) {
      const disabled = (this._floating || this._disabled || this._viewOnly);
      this.hiddenInput.setAttribute('tabindex', this.disabled ? '-1' : this.tabindex);
      this.hiddenInput.disabled = disabled;
      this.hiddenInput.readOnly = disabled;
    }
  }

  private updateDeltaYSmoothing(): void {
    const now = processMillis();

    this.touchDeltaTimes = this.touchDeltaTimes.filter((time, i) => {
      if (time < now + SWIPE_SMOOTHING_WINDOW) {
        this.touchDeltaYs.splice(i, 1);
        return false;
      }

      return true;
    });

    this.touchDeltaTimes.push(now);
    this.touchDeltaYs.push(this.touchDeltaY);

    if (now < this.initialTouchTime + MIN_SWIPE_TIME)
      this.smoothedDeltaY = 0;
    else
      this.smoothedDeltaY = max(min(this.touchDeltaYs.reduce((sum, y) => sum + y) / this.touchDeltaYs.length,
        this.digitHeight * MAX_DIGIT_SWIPE), -this.digitHeight * MAX_DIGIT_SWIPE);
  }

  private clearDeltaYSwiping(): void {
    this.smoothedDeltaY = 0;
    this.touchDeltaTimes.length = 0;
    this.touchDeltaY = 0;
    this.touchDeltaTimes.length = 0;
    this.touchDeltaYs.length = 0;
    this.swipeIndex = -1;
    this.items.forEach(item => item.swipeAbove = item.swipeBelow = null);
  }
}

This = DigitSequenceEditorDirective;
