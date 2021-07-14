import { animate, state, style, transition, trigger } from '@angular/animations';
import {
  AfterViewInit, Directive, ElementRef, EventEmitter, Injector, Input, OnDestroy, OnInit, Output, ViewChild
} from '@angular/core';
import { abs, floor, max, min, Point, round, sign } from '@tubular/math';
import {
  eventToKey, getCssValue, isAndroid, isChrome, isChromeOS, isEdge, isIOS, isNumber, isString, noop, processMillis,
  toBoolean, toNumber
} from '@tubular/util';
import { Subscription, timer } from 'rxjs';
import { getPageXYForTouchEvent } from '../util/touch-events';
import { AbstractControl, ControlValueAccessor, Validator } from '@angular/forms';

export interface SequenceItemInfo {
  alt_swipeAbove?: string;
  alt_swipeBelow?: string;
  alt_value?: string;
  bidi?: boolean;
  deltaY?: number;
  digit?: true;
  divider?: boolean;
  editable?: boolean;
  format?: string;
  hidden?: boolean;
  index?: number;
  indicator?: boolean;
  monospaced?: boolean;
  name?: string;
  opacity?: number | string;
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

let _hasIntl = false;
let _defaultLocale = 'en';

try {
  _hasIntl = typeof Intl !== 'undefined' && !!Intl?.DateTimeFormat;

  if (_hasIntl)
    Intl.NumberFormat('en').format(1.2);
  else
    console.warn('Intl.DateTimeFormat not available');
}
catch (e) {
  _hasIntl = false;
  console.warn('Intl.DateTimeFormat not available: %s', e.message || e.toString());
}

try {
  if (typeof process === 'object' && process.env?.LANG)
    _defaultLocale = process.env.LANG.replace(/\..*$/, '').replace(/_/g, '-');
  else if (typeof navigator === 'object' && navigator.language)
    _defaultLocale = navigator.language;
}
catch (e) {
  _defaultLocale = 'en';
}

export const hasIntl = _hasIntl;
export const defaultLocale = _defaultLocale;
export const FORWARD_TAB_DELAY = 250;

const FALSE_REPEAT_THRESHOLD = 50;
const KEY_REPEAT_DELAY = 500;
const KEY_REPEAT_RATE  = 100;
const FLASH_DURATION = 250;
const LONG_WARNING_DURATION = 2000;

const DIGIT_SWIPE_THRESHOLD = 6;
const MAX_DIGIT_SWIPE = 0.9;
const MIN_DIGIT_SWIPE = 0.33;
const MIN_SWIPE_TIME = 200;
const SWIPE_SMOOTHING_WINDOW = 500;

const NO_SELECTION = -1;
const SPIN_UP      = -2;
const SPIN_DOWN    = -3;

const addFocusOutline = isEdge() || isIOS();
const disableContentEditable = isEdge();

function getBackgroundColor(className: string, darkMode = false): string {
  const outer = document.createElement('div');
  const elem = document.createElement('div');

  if (darkMode)
    outer.classList.add('tbw-dark-mode');

  document.body.appendChild(outer);
  elem.classList.add(className);
  outer.appendChild(elem);
  const result = getCssValue(elem, 'background-color');
  document.body.removeChild(outer);

  return result;
}

function getBackgroundLevel(elem: HTMLElement): number {
  const color = getCssValue(elem, 'background-color');

  if (color === 'transparent')
    return elem.parentElement ? getBackgroundLevel(elem.parentElement) : 255;

  const channels = (/(\d+)\b.*?\b(\d+).*?\b(\d+)(?:.*?\b(\d+))?/.exec(color) ?? [0, 0, 0, 0, 0]).map(n => toNumber(n, 255));

  if (channels[4] != null && channels[4] === 0)
    return elem.parentElement ? getBackgroundLevel(elem.parentElement) : 255;

  return channels[1] * 0.21 + channels[2] * 0.72 + channels[3] * 0.07;
}

const DISABLED_ARROW_COLOR = 'tbw-disabled-arrow-color';
const DISABLED_BACKGROUND  = 'tbw-disabled-background';
const DISABLED_TEXT        = 'tbw-disabled-text';
const ERROR_BACKGROUND     = 'tbw-error-background';
const INDICATOR_TEXT       = 'tbw-indicator-text';
const NORMAL_BACKGROUND    = 'tbw-normal-background';
const NORMAL_TEXT          = 'tbw-normal-text';
const SELECTED_BACKGROUND  = 'tbw-selected-background';
const SELECTED_TEXT        = 'tbw-selected-text';
const SPINNER_FILL         = 'tbw-spinner-fill';
const VIEW_ONLY_TEXT       = 'tbw-view-only-text';
const VIEW_ONLY_BACKGROUND = 'tbw-view-only-background';
const WARNING_BACKGROUND   = 'tbw-warning-background';

export const BACKGROUND_ANIMATIONS = trigger('displayState', [
  state('error',     style({ backgroundColor: getBackgroundColor(ERROR_BACKGROUND) })),
  state('normal',    style({ backgroundColor: getBackgroundColor(NORMAL_BACKGROUND) })),
  state('warning',   style({ backgroundColor: getBackgroundColor(WARNING_BACKGROUND) })),
  state('view-only', style({ backgroundColor: getBackgroundColor(VIEW_ONLY_BACKGROUND) })),
  state('disabled',  style({ backgroundColor: getBackgroundColor(DISABLED_BACKGROUND) })),
  state('dark-error',     style({ backgroundColor: getBackgroundColor(ERROR_BACKGROUND, true) })),
  state('dark-normal',    style({ backgroundColor: getBackgroundColor(NORMAL_BACKGROUND, true) })),
  state('dark-warning',   style({ backgroundColor: getBackgroundColor(WARNING_BACKGROUND, true) })),
  state('dark-view-only', style({ backgroundColor: getBackgroundColor(VIEW_ONLY_BACKGROUND, true) })),
  state('dark-disabled',  style({ backgroundColor: getBackgroundColor(DISABLED_BACKGROUND, true) })),
  transition('normal => error',  animate(FLASH_DURATION)),
  transition('error => normal',  animate(FLASH_DURATION)),
  transition('warning => error', animate(FLASH_DURATION)),
  transition('error => warning', animate(FLASH_DURATION)),
  transition('dark-normal => dark-error',  animate(FLASH_DURATION)),
  transition('dark-error => dark-normal',  animate(FLASH_DURATION)),
  transition('dark-warning => dark-error', animate(FLASH_DURATION)),
  transition('dark-error => dark-warning', animate(FLASH_DURATION))
]);

const touchListener = (): void => {
  DigitSequenceEditorDirective.touchHasOccurred = true;
  document.removeEventListener('touchstart', touchListener);
};

document.addEventListener('touchstart', touchListener);

export function isNilOrBlank(v: any): boolean {
  return v == null || v === '';
}

let This: typeof DigitSequenceEditorDirective;

@Directive()
export abstract class DigitSequenceEditorDirective<T> implements
    AfterViewInit, ControlValueAccessor, OnInit, OnDestroy, Validator {
  // Template accessibility

  addFocusOutline = addFocusOutline;
  disableContentEditable = disableContentEditable;
  SPIN_DOWN = SPIN_DOWN;
  SPIN_UP = SPIN_UP;

  // ControlValueAccessor/Validator-related fields

  private afterViewInit = false;
  private _disabled = false;
  private pendingValueChange = false;

  protected changed = noop;
  protected lastValue: T = null;
  protected touched = noop;
  protected valid = true;
  protected _value: T = null;

  @Output() private valueChange = new EventEmitter<T>();

  // DigitSequenceEditorDirective specifics

  private static instances = new Set<DigitSequenceEditorDirective<any>>();
  private static lastKeyTimestamp = 0;
  private static lastKeyKey = '';
  private static mutationObserver: MutationObserver;
  private static useHiddenInput = isAndroid() || isChromeOS();
  private static checkForRepeatedKeyTimestamps = isIOS();

  static touchHasOccurred = false;

  private activeSpinner = NO_SELECTION;
  private clickTimer: Subscription;
  private darkMode = false;
  private errorTimer: Subscription;
  private firstTouchPoint: Point;
  private focusTimer: any;
  private getCharFromInputEvent = false;
  private hasHiddenInputFocus = false;
  private hasWrapperFocus = false;
  private ignoreFocus = 0;
  private initialTouchTime = 0;
  private keyTimer: Subscription;
  private lastDelta = 1;
  private touchDeltaY = 0;
  private touchDeltaYs: number[] = [];
  private touchDeltaTimes: number[] = [];
  private _viewOnly = false;
  private warningTimer: Subscription;

  protected emSizer: HTMLElement;
  protected hiddenInput: HTMLInputElement;
  protected lastTabTime = 0;
  protected letterDecrement = 'z';
  protected letterIncrement = 'a';
  protected selectionHidden = false;
  protected showFocus = false;
  protected swipeIndex = -1;
  protected _tabindex = '0';
  protected wrapper: HTMLElement;

  protected static addFocusOutline = isEdge() || isIOS();

  baselineShift = '0';
  digitHeight = 17;
  displayItems: SequenceItemInfo[] = [];
  displayState = 'normal';
  hasFocus = false;
  items: SequenceItemInfo[] = [];
  lineHeight: string;
  rtl = false;
  selection = 0;
  smoothedDeltaY = 0;
  useAlternateTouchHandling = false;

  @ViewChild('emSizer', { static: true }) private emSizerRef: ElementRef;
  @ViewChild('wrapper', { static: true }) private wrapperRef: ElementRef;

  protected constructor(protected injector: Injector) {
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
  }

  // Angular lifecycle

  ngOnInit(): void {
    this.wrapper = this.wrapperRef.nativeElement;
    this.emSizer = this.emSizerRef.nativeElement;

    this.wrapper.addEventListener('copy', evt => {
      evt.preventDefault();

      const text = this.getClipboardText();

      if (text)
        evt.clipboardData.setData('text/plain', text);
    });

    this.wrapper.addEventListener('paste', evt => {
      evt.preventDefault();
      this.doPaste(evt.clipboardData.getData('text/plain'));
    });

    this.createDigits();
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

  validate(control?: AbstractControl): { [key: string]: any } {
    const validation = this.validateImpl(this._value, control);
    this.valid = !validation;
    return validation;
  }

  protected validateImpl(_value: T, _control?: AbstractControl): { [key: string]: any } {
    return null;
  }

  // DigitSequenceEditorDirective specifics

  get tabindex(): string { return this._tabindex; }
  @Input() set tabindex(newValue: string) {
    if (this._tabindex !== newValue) {
      this._tabindex = newValue;
      this.adjustState();
    }
  }

  get viewOnly(): boolean { return this._viewOnly; }
  @Input() set viewOnly(value: boolean) {
    this._viewOnly = value;
    this.adjustState();
  }

  get hasHiddenInput(): boolean { return !!this.hiddenInput; }

  protected abstract createDigits(): void;

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
    if (!DigitSequenceEditorDirective.useHiddenInput)
      return;

    this.hiddenInput = document.createElement('input');
    this.hiddenInput.name = 'hidden';
    this.hiddenInput.type = 'password';
    this.hiddenInput.autocomplete = 'off';
    this.hiddenInput.setAttribute('autocapitalize', 'off');
    this.hiddenInput.setAttribute('autocomplete', 'off');
    this.hiddenInput.setAttribute('autocorrect', 'off');
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

  getStaticBackgroundColor(): string {
    if (this._disabled)
      return DISABLED_BACKGROUND;
    else if (this._viewOnly)
      return VIEW_ONLY_BACKGROUND;
    else
      return NORMAL_BACKGROUND;
  }

  getBackgroundColorForItem(item?: SequenceItemInfo, index = item?.index): string {
    if (!this._disabled && this.showFocus && !this.selectionHidden &&
        ((item && index === this.selection) || (!item && this.activeSpinner === index)))
      return SELECTED_BACKGROUND;
    else if (!this._disabled && !this.viewOnly && (index === SPIN_UP || index === SPIN_DOWN))
      return SPINNER_FILL;
    else
      return 'tbw-transparent';
  }

  getColorForItem(item?: SequenceItemInfo, index = item?.index): string {
    if (this._disabled)
      return DISABLED_TEXT;
    else if (item && this._viewOnly)
      return VIEW_ONLY_TEXT;
    else if (this._viewOnly)
      return DISABLED_ARROW_COLOR;
    else if (item && item.indicator)
      return INDICATOR_TEXT;
    else if (index === this.selection && this.showFocus && !this.selectionHidden)
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

  protected warningFlash(longer = false): void {
    if (this.warningTimer)
      return;

    if (!this.errorTimer)
      this.displayState = (this.darkMode ? 'dark-' : '') + 'warning';

    this.warningTimer = timer(longer ? LONG_WARNING_DURATION : FLASH_DURATION).subscribe(() => {
      this.warningTimer = undefined;
      this.displayState = (this.darkMode ? 'dark-' : '') + (this.errorTimer ? 'error' : 'normal');
    });
  }

  protected errorFlash(): void {
    if (this.errorTimer)
      return;

    this.displayState = (this.darkMode ? 'dark-' : '') + 'error';
    this.errorTimer = timer(FLASH_DURATION).subscribe(() => {
      this.errorTimer = undefined;
      this.displayState = (this.darkMode ? 'dark-' : '') + (this.warningTimer ? 'warning' : 'normal');
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

  onMouseDown(index: number, evt?: MouseEvent | TouchEvent): void {
    if (this._disabled || this.viewOnly || ((evt as any)?.button ?? 0) !== 0)
      return;
    else if (evt)
      evt.stopPropagation();

    if (this.items[index]?.spinner && evt?.target) {
      const r = (evt.target as HTMLElement).getBoundingClientRect();
      const y = ((evt as any).pageY ?? getPageXYForTouchEvent(evt as any).y);

      if (y < r.top + r.height / 2)
        index = SPIN_UP;
      else
        index = SPIN_DOWN;
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

  onTouchStart(index: number, evt: TouchEvent): void {
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

    if (this.hiddenInput && !this.disabled)
      this.wrapper.style.outline = getCssValue(this.hiddenInput, 'outline');
    else if (DigitSequenceEditorDirective.addFocusOutline)
      this.wrapper.style.outline = (newFocus && !this.disabled ? 'rgb(59, 153, 252) solid 1px' : 'black none 0px');
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
    if (DigitSequenceEditorDirective.checkForRepeatedKeyTimestamps &&
        (abs(evt.timeStamp - DigitSequenceEditorDirective.lastKeyTimestamp) <= FALSE_REPEAT_THRESHOLD &&
         key === DigitSequenceEditorDirective.lastKeyKey)) {
      evt.preventDefault();

      return false;
    }

    // With Android many on-screen keyboard key events carry no useful information about the key that was
    // pressed. They instead match the following test and we have to grab a character out of the hidden
    // input field to find out what was actually typed in.
    // noinspection JSDeprecatedSymbols (for `keyCode`)
    if (this.hiddenInput && key === 'Unidentified' && evt.keyCode === 229) {
      this.getCharFromInputEvent = true;
      DigitSequenceEditorDirective.lastKeyTimestamp = evt.timeStamp;

      return true;
    }

    if (/![xcv]/i.test(key) && (evt.ctrlKey || evt.metaKey) && !evt.altKey) {
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
    DigitSequenceEditorDirective.lastKeyTimestamp = evt.timeStamp;
    DigitSequenceEditorDirective.lastKeyKey = key;

    if (this.hiddenInput && (key === 'Backspace' || key === 'Delete')) {
      evt.stopPropagation();
      this.blurAndRefocusHack();
    }

    return false;
  }

  private doPaste(text?: string): void {
    if (text)
      this.applyPastedText(text);
    else
      navigator.clipboard.readText().then(txt => this.applyPastedText(txt));
  }

  protected applyPastedText(_text: string): void {
    // Default implementation does nothing.
  }

  private doCopy(): void {
    const text = this.getClipboardText();

    if (text)
      navigator.clipboard.writeText(text).finally(noop);
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

  protected onKey(key: string): void {
    if (this._disabled || this.viewOnly || !this.hasFocus || !this.items[this.selection]?.editable)
      return;

    if (key === '-' || key.toLowerCase() === this.letterDecrement)
      key = 'ArrowDown';
    else if (key === '+' || key === '=' || key.toLowerCase() === this.letterIncrement)
      key = 'ArrowUp';

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

      case ' ':
        this.cursorForward();
        break;

      default:
        if (key && key.length === 1)
          this.digitTyped(key.charCodeAt(0), key);
    }
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

  protected increment(): void {
    this.roll(1);
  }

  protected decrement(): void {
    this.roll(-1);
  }

  protected digitTyped(charCode: number, _key: string): void {
    if (48 <= charCode && charCode < 58) {
      this.items[this.selection].value = charCode - 48;
      this.cursorForward();
    }
  }

  protected checkDarkMode(immediate = false): void {
    let newState: string;

    this.darkMode = (getBackgroundLevel(this.wrapper.parentElement) < 128);

    if (this.darkMode && !this.displayState.startsWith('dark-'))
      newState = 'dark-' + this.displayState;
    else if (!this.darkMode && this.displayState.startsWith('dark-'))
      newState = this.displayState.substr(5);

    if (newState) {
      if (immediate)
        this.displayState = newState;
      else
        setTimeout(() => this.displayState = newState);
    }
  }

  protected adjustState(): void {
    this.displayState = (this.darkMode ? 'dark-' : '') +
      (this._viewOnly ? 'view-only' : (this._disabled ? 'disabled' : 'normal'));

    if (this.hiddenInput)
      this.hiddenInput.setAttribute('tabindex', this.disabled ? '-1' : this.tabindex);
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
