import type { ComponentProps } from 'react'
import { Field as BaseField } from '@base-ui/react/field'
import { withClass } from './withClass'

/**
 * A labelled control.
 *
 * The two places this serves — naming an assembly, and the catalog's search
 * box — both had a label problem the hand-rolled markup solved differently.
 * The search box has an `aria-label` and no visible label; the assembly name
 * box has a placeholder standing in for one, which disappears the moment
 * someone starts typing and takes the only description of the box with it.
 *
 * `Field.Root` wires label, description and error to the control by id, so a
 * visible label costs nothing to add and the wiring cannot drift.
 */
function Root({ className, ...props }: ComponentProps<typeof BaseField.Root>) {
  return <BaseField.Root className={withClass('field', className)} {...props} />
}

function Label({ className, ...props }: ComponentProps<typeof BaseField.Label>) {
  return <BaseField.Label className={withClass('field-label', className)} {...props} />
}

function Control({ className, ...props }: ComponentProps<typeof BaseField.Control>) {
  return <BaseField.Control className={withClass('field-control', className)} {...props} />
}

function Description({ className, ...props }: ComponentProps<typeof BaseField.Description>) {
  return <BaseField.Description className={withClass('field-description', className)} {...props} />
}

function Error({ className, ...props }: ComponentProps<typeof BaseField.Error>) {
  return <BaseField.Error className={withClass('field-error', className)} {...props} />
}

export const Field = { Root, Label, Control, Description, Error }
