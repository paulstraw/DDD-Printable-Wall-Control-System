import type { RefAttributes } from 'react'
import { ToggleGroup as BaseToggleGroup } from '@base-ui/react/toggle-group'
import type { ToggleGroupProps, ToggleGroupState } from '@base-ui/react/toggle-group'
import { Toggle as BaseToggle } from '@base-ui/react/toggle'
import type { ToggleProps, ToggleState } from '@base-ui/react/toggle'
import { withClass } from './withClass'

/**
 * A row of buttons where the pressed one is the current setting.
 *
 * Both places this replaces — flat/shelf, and the section's X/Y/Z — were
 * hand-rolled rows of `aria-pressed` buttons, which is the definition of a
 * toggle group and gets arrow-key navigation for nothing.
 *
 * `.toggle-group` and `.toggle` carry only what the two call sites already
 * agree on — which is the pressed look, an ink fill with white text, written
 * out identically in both today. The rest stays where it is: the sizes,
 * borders and radii differ between the header and the section overlay and
 * always did, and their existing descendant rules still reach the buttons.
 *
 * The value is an **array** even when only one button can be pressed. That is
 * Base UI's shape and it is kept rather than smoothed over, because the empty
 * array is exactly what a mixed selection needs: several parts, no agreed
 * orientation, nothing pressed. A scalar API would have to invent a null for
 * that, which is the same thing with more code in between.
 */
export function ToggleGroup<Value extends string>({
  className,
  ...props
}: ToggleGroupProps<Value> & RefAttributes<HTMLDivElement>) {
  return (
    <BaseToggleGroup<Value>
      className={withClass<ToggleGroupState>('toggle-group', className)}
      {...props}
    />
  )
}

/** One button in a {@link ToggleGroup}. Styled by the group around it. */
export function Toggle<Value extends string>({
  className,
  ...props
}: ToggleProps<Value> & RefAttributes<HTMLButtonElement>) {
  return <BaseToggle<Value> className={withClass<ToggleState>('toggle', className)} {...props} />
}
