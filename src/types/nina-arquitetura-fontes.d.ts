declare module "virtual:nina-arquitetura-fontes" {
  const fontes: Record<string, () => Promise<string>>;
  export default fontes;
}
