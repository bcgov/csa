import apiService from '@/service/api-service'
import type { FC } from 'react'
import { useEffect, useState } from 'react'
import { Button, Modal, Table } from 'react-bootstrap'
import type ContactDto from 'src/interfaces/ContactDto'
import type { AxiosResponse } from '~/axios'

type ModalProps = {
  show: boolean
  onHide: () => void
  contact?: ContactDto
}

const ModalComponent: FC<ModalProps> = ({ show, onHide, contact }) => {
  return (
    <Modal
      show={show}
      onHide={onHide}
      size="lg"
      aria-labelledby="contained-modal-title-vcenter"
      centered
    >
      <Modal.Header closeButton>
        <Modal.Title id="contained-modal-title-vcenter">Row Details</Modal.Title>
      </Modal.Header>
      <Modal.Body>{JSON.stringify(contact)}</Modal.Body>
      <Modal.Footer>
        <Button onClick={onHide}>Close</Button>
      </Modal.Footer>
    </Modal>
  )
}

const Dashboard: FC = () => {
  const [data, setData] = useState<any>([])
  const [selectedContact, setSelectedUser] = useState<ContactDto | undefined>(undefined)

  useEffect(() => {
    apiService
      .getAxiosInstance()
      .get('/contacts')
      .then((response: AxiosResponse) => {
        const contacts: ContactDto[] = []
        for (const contact of response.data) {
          const contactDto = {
            id: contact.id,
            last_name: contact.last_name,
            given_names: contact.given_names,
            csa_status: contact.csa_status,
          }
          contacts.push(contactDto)
        }
        setData(contacts)
      })
      .catch((error) => {
        console.error(error)
      })
  }, [])

  const handleClose = () => {
    setSelectedUser(undefined)
  }

  return (
    <div className="min-vh-45 mh-45 mw-50 ml-4">
      <Table striped bordered hover>
        <thead>
          <tr>
            <th>Contact ID</th>
            <th>Contact Last Name</th>
            <th>Contact Given Name</th>
            <th>Contact CS Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.map((contact: ContactDto) => (
            <tr key={contact.id}>
              <td>{contact.id}</td>
              <td>{contact.last_name}</td>
              <td>{contact.given_names}</td>
              <td>{contact.csa_status}</td>
              <td className="text-center">
                <Button variant="secondary" size="sm" onClick={() => setSelectedUser(contact)}>
                  View Details
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      <ModalComponent show={!!selectedContact} onHide={handleClose} contact={selectedContact} />
    </div>
  )
}

export default Dashboard
