import apiService from '@/service/api-service'
import type { FC } from 'react'
import { useEffect, useState } from 'react'
import { Button, Modal, Table } from 'react-bootstrap'
import type ApplicantDto from 'src/interfaces/ApplicantDto'
import type { AxiosResponse } from '~/axios'

type ModalProps = {
  show: boolean
  onHide: () => void
  applicant?: ApplicantDto
}

const ModalComponent: FC<ModalProps> = ({ show, onHide, applicant }) => {
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
      <Modal.Body>{JSON.stringify(applicant)}</Modal.Body>
      <Modal.Footer>
        <Button onClick={onHide}>Close</Button>
      </Modal.Footer>
    </Modal>
  )
}

const Dashboard: FC = () => {
  const [data, setData] = useState<any>([])
  const [selectedApplicant, setSelectedUser] = useState<ApplicantDto | undefined>(undefined)

  useEffect(() => {
    apiService
      .getAxiosInstance()
      .get('/v1/applicants')
      .then((response: AxiosResponse) => {
        const applicants: ApplicantDto[] = []
        for (const applicant of response.data) {
          const applicantDto = {
            id: applicant.id,
            last_name: applicant.last_name,
            given_name: applicant.given_name,
            csa_status: applicant.csa_status,
          }
          applicants.push(applicantDto)
        }
        setData(applicants)
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
            <th>Applicant ID</th>
            <th>Applicant Last Name</th>
            <th>Applicant Given Name</th>
            <th>Applicant CS Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.map((applicant: ApplicantDto) => (
            <tr key={applicant.id}>
              <td>{applicant.id}</td>
              <td>{applicant.last_name}</td>
              <td>{applicant.given_name}</td>
              <td>{applicant.csa_status}</td>
              <td className="text-center">
                <Button variant="secondary" size="sm" onClick={() => setSelectedUser(applicant)}>
                  View Details
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      <ModalComponent show={!!selectedApplicant} onHide={handleClose} applicant={selectedApplicant} />
    </div>
  )
}

export default Dashboard
