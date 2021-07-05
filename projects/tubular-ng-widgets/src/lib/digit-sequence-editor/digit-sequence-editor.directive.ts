import { animate, state, style, transition, trigger } from '@angular/animations';
import {
  AfterViewInit, Directive, ElementRef, EventEmitter, Injector, Input, OnDestroy, OnInit, Output, ViewChild
} from '@angular/core';
import { abs, max, min, mod, Point, round, sign } from '@tubular/math';
import {
  eventToKey, getCssValue, isAndroid, isEdge, isIOS, isString, noop, processMillis, toBoolean, toNumber
} from '@tubular/util';
import { Subscription, timer } from 'rxjs';
import { getPageXYForTouchEvent } from '../util/touch-events';
import { AbstractControl, ControlValueAccessor, Validator } from '@angular/forms';

export interface SequenceItemInfo {
  alt_swipeAbove?: string;
  alt_swipeBelow?: string;
  alt_value?: string;
  bidi?: boolean;
  digit?: true;
  divider?: boolean;
  editable?: boolean;
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

export const FORWARD_TAB_DELAY = 250;

const FALSE_REPEAT_THRESHOLD = 50;
const KEY_REPEAT_DELAY = 500;
const KEY_REPEAT_RATE  = 100;
const FLASH_DURATION = 250;
const LONG_WARNING_DURATION = 2500;

const DIGIT_SWIPE_THRESHOLD = 6;
const MAX_DIGIT_SWIPE = 0.9;
const MIN_DIGIT_SWIPE = 0.33;
const MIN_SWIPE_TIME = 200;
const SWIPE_SMOOTHING_WINDOW = 500;

const NO_SELECTION = -1;
const SPIN_UP      = -2;
const SPIN_DOWN    = -3;

const NORMAL_BACKGROUND    = 'white';
const DISABLED_BACKGROUND  = '#CCC';
const ERROR_BACKGROUND     = '#F67';
const VIEW_ONLY_BACKGROUND = 'black';
const WARNING_BACKGROUND   = '#FC6';

const addFocusOutline = isEdge() || isIOS();
const disableContentEditable = isEdge();

export const BACKGROUND_ANIMATIONS = trigger('displayState', [
  state('error',    style({ backgroundColor: ERROR_BACKGROUND })),
  state('normal',   style({ backgroundColor: NORMAL_BACKGROUND })),
  state('warning',  style({ backgroundColor: WARNING_BACKGROUND })),
  state('viewOnly', style({ backgroundColor: VIEW_ONLY_BACKGROUND })),
  state('disabled', style({ backgroundColor: DISABLED_BACKGROUND })),
  transition('normal => error',  animate(FLASH_DURATION)),
  transition('error => normal',  animate(FLASH_DURATION)),
  transition('warning => error', animate(FLASH_DURATION)),
  transition('error => warning', animate(FLASH_DURATION))
]);

const NORMAL_TEXT          = 'black';
const DISABLED_ARROW_COLOR = '#060';
const DISABLED_TEXT        = '#999';
const INDICATOR_TEXT       = 'blue';
const SELECTED_TEXT        = 'white';
const SPINNER_FILL         = '#EEE';
const VIEW_ONLY_TEXT       = '#0F0';

const touchListener = (): void => {
  DigitSequenceEditorDirective.touchHasOccurred = true;
  document.removeEventListener('touchstart', touchListener);
};

document.addEventListener('touchstart', touchListener);

export function isNilOrBlank(v: any): boolean {
  return v == null || v === '';
}

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

  private static lastKeyTimestamp = 0;
  private static lastKeyKey = '';
  private static useHiddenInput = isAndroid();
  private static checkForRepeatedKeyTimestamps = isIOS();

  static touchHasOccurred = false;

  private activeSpinner = NO_SELECTION;
  private clickTimer: Subscription;
  private errorTimer: Subscription;
  private firstTouchPoint: Point;
  private focusTimer: any;
  private getCharFromInputEvent = false;
  private hasHiddenInputFocus = false;
  private hasWrapperFocus = false;
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

  protected constructor(protected injector: Injector) {}

  // Angular lifecycle

  ngOnInit(): void {
    this.wrapper = this.wrapperRef.nativeElement;
    this.emSizer = this.emSizerRef.nativeElement;
    this.createDigits();
    this.createDisplayOrder();
    this.createHiddenInput();
  }

  ngAfterViewInit(): void {
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

  protected createDigits(): void {
    this.selection = 10;

    for (let i = 0; i <= 10; ++i) {
      this.items.push({ value: i === 5 ? ':' : i - (i > 5 ? 1 : 0), editable: i !== 5, selected: i === this.selection });
    }

    this.items.push({ divider: true });
    this.items.push({ spinner: true });
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
    this.hiddenInput.type = 'text';
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
  }

  getAlignmentForItem(item: SequenceItemInfo): string {
    return item.digit ? 'center' : 'flex-start';
  }

  getClassForItem(item: SequenceItemInfo): string {
    if (item.monospaced && item.indicator)
      return 'mono-indicator-font';
    else if (item.indicator)
      return 'indicator-font';
    else if (item.monospaced)
      return 'mono-font';
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
      return NORMAL_TEXT;
    else if (!this._disabled && !this.viewOnly && (index === SPIN_UP || index === SPIN_DOWN))
      return SPINNER_FILL;
    else
      return 'transparent';
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
    const item = this.items[index];
    const value = toNumber(item.value);

    if (this.canSwipe(item)) {
      if (index !== 0 || value < 9)
        item.swipeAbove = mod(toNumber(item.value) + 1, 10).toString();

      if (index !== 0 || value > 0)
        item.swipeBelow = mod(toNumber(item.value) - 1, 10).toString();
    }
  }

  returnFalse(): boolean {
    return false;
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

    evt.preventDefault();
    evt.stopPropagation();

    if (this.selection >= 0 && this.firstTouchPoint) {
      const pt = getPageXYForTouchEvent(evt);

      this.touchDeltaY = pt.y - this.firstTouchPoint.y;
      this.updateDeltaYSmoothing();
    }
  }

  onTouchEnd(event: TouchEvent): void {
    const lastDeltaY = this.touchDeltaY;

    if (this._disabled || this.viewOnly)
      return;

    event.preventDefault();
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

  onFocus(value: boolean): void {
    if (value && this.viewOnly)
      return;

    if (this.hasWrapperFocus !== value) {
      this.hasWrapperFocus = value;

      if (value && this.hiddenInput && !this.hiddenInput.disabled)
        this.hiddenInput.focus();

      this.checkFocus();
    }
  }

  onHiddenInputFocus(value: boolean): void {
    if (value && this.viewOnly)
      return;

    if (this.hasHiddenInputFocus !== value) {
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

    if (key === 'Tab')
      this.lastTabTime = performance.now();

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

    return false;
  }

  onKeyUp(): boolean {
    this.stopKeyTimer();

    return true;
  }

  // noinspection JSMethodCanBeStatic
  onKeyPress(evt: KeyboardEvent): boolean {
    const key = eventToKey(evt);

    if (key === 'Tab')
      this.lastTabTime = performance.now();

    if (key === 'Tab' || evt.altKey || evt.ctrlKey || evt.metaKey || /^F\d+$/.test(key))
      return true;

    evt.preventDefault();
    return false;
  }

  onInput(): void {
    if (this.getCharFromInputEvent) {
      const currInput = this.hiddenInput.value;

      if (currInput && currInput.length > 0)
        this.onKey(currInput.substr(currInput.length - 1));
    }

    this.hiddenInput.value = '';
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
      case 'Enter':
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
    this.items[this.selection].value = ((this.items[this.selection].value as number) + 1) % 10;
  }

  protected decrement(): void {
    this.items[this.selection].value = ((this.items[this.selection].value as number) + 9) % 10;
  }

  protected digitTyped(charCode: number, _key: string): void {
    if (48 <= charCode && charCode < 58) {
      this.items[this.selection].value = charCode - 48;
      this.cursorForward();
    }
  }

  protected adjustState(): void {
    this.displayState = this._viewOnly ? 'viewOnly' : (this._disabled ? 'disabled' : 'normal');

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
