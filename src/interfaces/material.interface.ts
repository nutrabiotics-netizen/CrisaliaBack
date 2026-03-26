 

export interface IPresentacionItem {
  nombre: string;
  mockup?: string;
}

export interface IMaterial {
  codigo: string;
  nombre?: string;
  marca?: string;
  formaFarmaceutica?: string;
  concentracion?: string;
  unidadMedida?: string;
  viaAdministracion?: string;
  presentacion?: string;
  recomendacionesUso?: string;
  registroSanitario?: string;
  categoria?: string;
  descripcion?: string;
  composicion?: string;
  
  presentaciones?: IPresentacionItem[];
  mockups?: string[];
  linksRotulos?: string[];
  
  activo?: boolean;
}
