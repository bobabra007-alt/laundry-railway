import { currentUser } from '@/lib/access';import RegulationForm from '../RegulationForm';
export default async function NewRegulation(){await currentUser();return <div className="stack"><a className="sub" href="/regulations">Все регламенты</a><h1 className="title">Новый регламент</h1><div className="card"><RegulationForm/></div></div>;}
