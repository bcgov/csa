import App from '@/App'
import { createFileRoute } from '@tanstack/react-router'
import '../index.css'

export const Route = createFileRoute('/')({
  component: Index,
})

function Index() {
  return <App />
}
