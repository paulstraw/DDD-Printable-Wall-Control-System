import type { ComponentProps } from 'react'
import { NumberField as BaseNumberField } from '@base-ui/react/number-field'
import { NO_AUTOFILL } from './Input'
import { withClass } from './withClass'

/**
 * A number that can be typed, stepped or dragged.
 *
 * The wall size is the only number in the app, and `<input type="number">` was
 * serving it badly: the spinners are unreachable by touch, the wheel changes
 * the value while you are scrolling past it, and what the browser accepts as
 * you type varies by browser. Base UI's version has real increment and
 * decrement buttons, and a scrub area — drag the label sideways and the number
 * follows — which is the one interaction that suits "how wide is this wall,
 * roughly" better than typing does.
 *
 * `allowWheelScrub` stays off. This sits in a header above a scrolling page,
 * and a wheel that resizes the wall while someone means to scroll is a change
 * they did not ask for and may not notice.
 */
function Root({ className, ...props }: ComponentProps<typeof BaseNumberField.Root>) {
  return <BaseNumberField.Root className={withClass('number-field', className)} {...props} />
}

function Group({ className, ...props }: ComponentProps<typeof BaseNumberField.Group>) {
  return <BaseNumberField.Group className={withClass('number-field-group', className)} {...props} />
}

/**
 * The reason `NO_AUTOFILL` exists — see `Input.tsx`. Base UI parses numbers
 * itself, so this renders `type="text"`, and a text input is what a password
 * manager comes looking for.
 */
function Input({ className, ...props }: ComponentProps<typeof BaseNumberField.Input>) {
  return (
    <BaseNumberField.Input
      {...NO_AUTOFILL}
      className={withClass('number-field-input', className)}
      {...props}
    />
  )
}

function Increment({ className, ...props }: ComponentProps<typeof BaseNumberField.Increment>) {
  return <BaseNumberField.Increment className={withClass('number-field-step', className)} {...props} />
}

function Decrement({ className, ...props }: ComponentProps<typeof BaseNumberField.Decrement>) {
  return <BaseNumberField.Decrement className={withClass('number-field-step', className)} {...props} />
}

function ScrubArea({ className, ...props }: ComponentProps<typeof BaseNumberField.ScrubArea>) {
  return <BaseNumberField.ScrubArea className={withClass('number-field-scrub', className)} {...props} />
}

function ScrubAreaCursor({
  className,
  ...props
}: ComponentProps<typeof BaseNumberField.ScrubAreaCursor>) {
  return (
    <BaseNumberField.ScrubAreaCursor
      className={withClass('number-field-scrub-cursor', className)}
      {...props}
    />
  )
}

export const NumberField = {
  Root,
  Group,
  Input,
  Increment,
  Decrement,
  ScrubArea,
  ScrubAreaCursor,
}
