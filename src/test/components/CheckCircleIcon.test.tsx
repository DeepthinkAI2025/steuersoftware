import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import CheckCircleIcon from '../../../components/icons/CheckCircleIcon'

describe('CheckCircleIcon', () => {
  it('renders without crashing', () => {
    const { container } = render(<CheckCircleIcon />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })

  it('has correct SVG attributes', () => {
    const { container } = render(<CheckCircleIcon />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24')
    expect(svg).toHaveAttribute('fill', 'none')
  })
})